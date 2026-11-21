package service

import (
	"bytes"
	"caorushizi.cn/mediago/internal/db"
	"caorushizi.cn/mediago/internal/db/repo"
	"context"
	"errors"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
)

type thumbnailConfig map[string]any

func (c thumbnailConfig) Get(key string) any { return c[key] }
func thumbnailServices(t *testing.T) (*DownloadTaskService, *TaskThumbnailService) {
	t.Helper()
	database, err := db.New(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	tasks := NewDownloadTaskService(repo.NewVideoRepository(database), nil, nil)
	thumbs := NewTaskThumbnailService(tasks, "", t.TempDir(), thumbnailConfig{})
	return tasks, thumbs
}
func thumbnailPNG(t *testing.T) []byte {
	t.Helper()
	var b bytes.Buffer
	if e := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 16, 9))); e != nil {
		t.Fatal(e)
	}
	return b.Bytes()
}
func TestTaskThumbnailUsesSavedCoverAndPersistentCache(t *testing.T) {
	tasks, thumbs := thumbnailServices(t)
	pngData := thumbnailPNG(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.Write(pngData) }))
	defer server.Close()
	cover := server.URL + "/cover.png"
	task, e := tasks.AddDownloadTask(&AddDownloadTaskInput{Name: "saved.mp4", Type: "youtube-single", URL: "https://example.com/watch", Thumbnail: &cover})
	if e != nil {
		t.Fatal(e)
	}
	thumbs.resolve = func(context.Context, string) (*MediaPreview, error) {
		t.Error("saved cover should not parse again")
		return nil, errors.New("unexpected")
	}
	for i := 0; i < 2; i++ {
		data, contentType, e := thumbs.Get(context.Background(), task.ID)
		if e != nil || contentType != "image/png" || !bytes.Equal(data, pngData) {
			t.Fatalf("thumbnail %s %v", contentType, e)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("cover fetched %d times", calls.Load())
	}
	restored, _ := tasks.FindByID(task.ID)
	if restored.Thumbnail == nil || *restored.Thumbnail != cover || restored.Options != nil || restored.Status != "ready" {
		t.Fatalf("task changed: %+v", restored)
	}
}
func TestLegacyThumbnailBackfillKeepsTaskStateAndInvalidatesBySource(t *testing.T) {
	tasks, thumbs := thumbnailServices(t)
	pngData := thumbnailPNG(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write(pngData) }))
	defer server.Close()
	task, e := tasks.AddDownloadTask(&AddDownloadTaskInput{Name: "legacy.mp4", Type: "youtube", URL: "https://example.com/old"})
	if e != nil {
		t.Fatal(e)
	}
	var parses int
	thumbs.resolve = func(ctx context.Context, url string) (*MediaPreview, error) {
		parses++
		return &MediaPreview{Thumbnail: server.URL + "/cover.png"}, nil
	}
	if _, _, e = thumbs.Get(context.Background(), task.ID); e != nil {
		t.Fatal(e)
	}
	restored, _ := tasks.FindByID(task.ID)
	if restored.Thumbnail == nil || restored.Options != nil || restored.Status != "ready" {
		t.Fatalf("old task behavior changed: %+v", restored)
	}
	if _, e = tasks.EditDownloadTask(task.ID, map[string]interface{}{"url": "https://example.com/new"}); e != nil {
		t.Fatal(e)
	}
	restored, _ = tasks.FindByID(task.ID)
	if restored.Thumbnail != nil {
		t.Fatal("source change retained previous cover")
	}
	if _, _, e = thumbs.Get(context.Background(), task.ID); e != nil {
		t.Fatal(e)
	}
	if parses != 2 {
		t.Fatal("source change reused cached image")
	}
}
func TestTaskThumbnailRejectsNonRasterAndInvalidMetadata(t *testing.T) {
	tasks, thumbs := thumbnailServices(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("<svg onload='bad()'></svg>")) }))
	defer server.Close()
	cover := server.URL
	task, e := tasks.AddDownloadTask(&AddDownloadTaskInput{Name: "invalid", Type: "youtube", URL: "https://example.com/watch", Thumbnail: &cover})
	if e != nil {
		t.Fatal(e)
	}
	thumbs.resolve = func(context.Context, string) (*MediaPreview, error) { return nil, errors.New("unavailable") }
	if _, _, e = thumbs.Get(context.Background(), task.ID); e == nil {
		t.Fatal("served non-raster thumbnail")
	}
	invalid := "file:///C:/private.png"
	if _, e = tasks.AddDownloadTask(&AddDownloadTaskInput{Name: "bad", Type: "youtube", URL: "https://example.com/watch", Thumbnail: &invalid}); !errors.Is(e, ErrInvalidTaskInput) {
		t.Fatal("invalid thumbnail metadata accepted")
	}
}

func TestMissingThumbnailCanRecoverWhenLocalOutputBecomesAvailable(t *testing.T) {
	tasks, thumbs := thumbnailServices(t)
	directory := t.TempDir()
	thumbs.config = thumbnailConfig{"local": directory}
	task, err := tasks.AddDownloadTask(&AddDownloadTaskInput{Name: "image.png", Type: "youtube", URL: "https://example.com/unavailable"})
	if err != nil {
		t.Fatal(err)
	}
	thumbs.resolve = func(context.Context, string) (*MediaPreview, error) { return nil, errors.New("offline") }
	if _, _, err = thumbs.Get(context.Background(), task.ID); err == nil {
		t.Fatal("expected no cover before output exists")
	}
	data := thumbnailPNG(t)
	if err = os.WriteFile(filepath.Join(directory, "image.png"), data, 0600); err != nil {
		t.Fatal(err)
	}
	if err = tasks.SetStatus([]int64{task.ID}, "success"); err != nil {
		t.Fatal(err)
	}
	actual, _, err := thumbs.Get(context.Background(), task.ID)
	if err != nil || !bytes.Equal(actual, data) {
		t.Fatalf("completion retained negative cover cache: %v", err)
	}
}
