package server

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"caorushizi.cn/mediago/internal/core"
	"caorushizi.cn/mediago/internal/db"
	"caorushizi.cn/mediago/internal/logger"
	"go.uber.org/zap"
)

func TestTaskCreationPreservesExplicitDirectorySnapshot(t *testing.T) {
	logger.Logger = zap.NewNop()
	logger.Sugar = logger.Logger.Sugar()
	database, err := db.New(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	chosen, newer := t.TempDir(), t.TempDir()
	s := New(core.NewTaskQueue(nil, 1), nil, database, playbackTestConfig{"local": newer})
	for index, selected := range []string{chosen, ""} {
		o := &core.MediaOptions{Version: 1, Mode: "video", SaveDir: selected}
		body, _ := json.Marshal(map[string]any{"tasks": []any{map[string]any{"name": "chosen", "type": "youtube-single", "url": "https://example.com/a.mp4", "options": o}}})
		r := httptest.NewRequest("POST", "/api/downloads", bytes.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		s.Engine().ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatalf("creation failed: %s", w.Body.String())
		}
		task, err := s.downloadService.FindByID(int64(index + 1))
		if err != nil {
			t.Fatal(err)
		}
		want := chosen
		if selected == "" {
			want = newer
		}
		if task.Options.SaveDir != want {
			t.Fatalf("saved %q, want click-time directory %q", task.Options.SaveDir, want)
		}
	}
}
