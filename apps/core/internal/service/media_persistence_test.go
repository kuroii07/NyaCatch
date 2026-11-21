package service

import (
	"caorushizi.cn/mediago/internal/core"
	"caorushizi.cn/mediago/internal/db"
	"caorushizi.cn/mediago/internal/db/repo"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"os"
	"path/filepath"
	"testing"
)

func TestLegacyDatabaseAndMediaOptionsSurviveReopen(t *testing.T) {
	file := filepath.Join(t.TempDir(), "tasks.db")
	old, err := gorm.Open(sqlite.Open(file), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err = old.Exec(`CREATE TABLE video(id integer PRIMARY KEY AUTOINCREMENT,name text NOT NULL UNIQUE,type text NOT NULL DEFAULT 'm3u8',url text NOT NULL,folder text,headers text,isLive integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'ready',createdDate datetime,updatedDate datetime)`).Error; err != nil {
		t.Fatal(err)
	}
	old.Exec(`INSERT INTO video(name,type,url,status) VALUES('old.mp4','youtube','https://example.com/old','success')`)
	conn, _ := old.DB()
	conn.Close()
	database, err := db.New(file)
	if err != nil {
		t.Fatal(err)
	}
	svc := NewDownloadTaskService(repo.NewVideoRepository(database), nil, nil)
	legacy, err := svc.FindByID(1)
	if err != nil || legacy.Options != nil || legacy.Name != "old.mp4" {
		t.Fatalf("old row changed: %+v %v", legacy, err)
	}
	dir := t.TempDir()
	created, err := svc.AddDownloadTask(&AddDownloadTaskInput{Name: "clip.mp3", Type: "youtube-single", URL: "https://example.com/clip", Options: &core.MediaOptions{Version: 1, Mode: "audio", AudioFormat: "mp3", AudioBitrate: 192, SaveDir: dir}})
	if err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(dir, "clip.mp3")
	os.WriteFile(output, []byte("media"), 0600)
	if err = svc.RecordOutput(created.ID, output); err != nil {
		t.Fatal(err)
	}
	database.Close()
	database, err = db.New(file)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	svc = NewDownloadTaskService(repo.NewVideoRepository(database), nil, nil)
	restored, err := svc.FindByID(created.ID)
	if err != nil || restored.Options == nil || restored.Options.SaveDir != dir || restored.Options.AudioBitrate != 192 || restored.OutputPath == nil || *restored.OutputPath != output {
		t.Fatalf("options/path lost after restart: %+v %v", restored, err)
	}
	result, err := svc.GetDownloadTasks(1, 20, "", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range result.List {
		if item.ID == created.ID && (!item.Exists || item.File != output) {
			t.Fatalf("changing default directory lost output: %+v", item)
		}
	}
}

func TestInvalidMediaBatchCreatesNothingAndSearchPagesAreCorrect(t *testing.T) {
	database, err := db.New(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	svc := NewDownloadTaskService(repo.NewVideoRepository(database), nil, nil)
	dir := t.TempDir()
	_, err = svc.AddDownloadTasks([]*AddDownloadTaskInput{{Name: "good.mp4", Type: "youtube-single", URL: "https://example.com/a", Options: &core.MediaOptions{Version: 1, Mode: "video", SaveDir: dir}}, {Name: "bad.mp4", Type: "youtube-single", URL: "https://example.com/b", Options: &core.MediaOptions{Version: 99, Mode: "video", SaveDir: dir}}})
	if err == nil {
		t.Fatal("invalid options were accepted")
	}
	result, _ := svc.GetDownloadTasks(1, 20, "", dir)
	if result.Total != 0 {
		t.Fatal("invalid batch partially persisted")
	}
	for _, name := range []string{"Clip A", "Clip B", "Other", "Clip C"} {
		v, e := svc.AddDownloadTask(&AddDownloadTaskInput{Name: name, Type: "youtube", URL: "https://x.com/example"})
		if e != nil {
			t.Fatal(e)
		}
		svc.SetStatus([]int64{v.ID}, "failed")
	}
	result, err = svc.GetDownloadTasks(2, 2, "list", dir, "Clip", "failed")
	if err != nil || result.Total != 3 || len(result.List) != 1 {
		t.Fatalf("search was applied after pagination: %+v %v", result, err)
	}
}

func TestStructuredTaskCannotBeMutatedThroughLegacyEdit(t *testing.T) {
	database, err := db.New(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	svc := NewDownloadTaskService(repo.NewVideoRepository(database), nil, nil)
	task, err := svc.AddDownloadTask(&AddDownloadTaskInput{Name: "clip.mp4", Type: "youtube-single", URL: "https://example.com/clip", Options: &core.MediaOptions{Version: 1, Mode: "video", SaveDir: t.TempDir()}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = svc.EditDownloadTask(task.ID, map[string]interface{}{"name": "else.mp4", "outputPath": "arbitrary"}); err == nil {
		t.Fatal("legacy edit changed structured task")
	}
	restored, _ := svc.FindByID(task.ID)
	if restored.Name != "clip.mp4" || restored.OutputPath != nil {
		t.Fatal("structured fields changed")
	}
}

func TestNewMediaTaskDoesNotReuseRetainedPartialFiles(t *testing.T) {
	database, err := db.New(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	svc := NewDownloadTaskService(repo.NewVideoRepository(database), nil, nil)
	for i, partial := range []string{"clip.mp4.part", "clip.f137.mp4.part", "clip.f140.m4a", "clip.mp4.ytdl"} {
		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, partial), []byte("retained old URL data"), 0600); err != nil {
			t.Fatal(err)
		}
		task, err := svc.AddDownloadTask(&AddDownloadTaskInput{Name: "clip.mp4", Type: "youtube-single", URL: "https://example.com/new", Options: &core.MediaOptions{Version: 1, Mode: "video", SaveDir: dir}})
		if err != nil {
			t.Fatal(err)
		}
		if i == 0 && task.Name == "clip.mp4" {
			t.Error("new task would resume another URL's .part file")
		}
		// Each case uses a fresh DB name, so remove only the record, keeping the fixture.
		if err = svc.DeleteDownloadTask(task.ID); err != nil {
			t.Fatal(err)
		}
		if task.Name == "clip.mp4" {
			t.Errorf("ignored companion %s", partial)
		}
	}
	dir := t.TempDir()
	tasks, err := svc.AddDownloadTasks([]*AddDownloadTaskInput{
		{Name: "batch.mp4", Type: "youtube-single", URL: "https://example.com/a", Options: &core.MediaOptions{Version: 1, Mode: "video", SaveDir: dir}},
		{Name: "batch.webm", Type: "youtube-single", URL: "https://example.com/b", Options: &core.MediaOptions{Version: 1, Mode: "video", SaveDir: dir}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if core.MediaFilenameStem(tasks[0].Name) == core.MediaFilenameStem(tasks[1].Name) {
		t.Fatal("batch reused an output stem")
	}
}
