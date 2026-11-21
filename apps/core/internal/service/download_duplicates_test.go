package service

import (
	"caorushizi.cn/mediago/internal/core"
	"caorushizi.cn/mediago/internal/db"
	"caorushizi.cn/mediago/internal/db/repo"
	"path/filepath"
	"testing"
)

func TestDuplicateIdentityPreservesSelectionAndUnknownQuery(t *testing.T) {
	a := &core.MediaOptions{Version: 1, Mode: "video", FormatID: "v1", SaveDir: "C:\\one"}
	b := *a
	b.SaveDir = "C:\\two"
	if duplicateIdentity("https://example.com/?p=1", a) != duplicateIdentity("https://example.com/?p=1", &b) {
		t.Fatal("folder should not hide previous downloads")
	}
	if duplicateIdentity("https://example.com/?p=1", a) == duplicateIdentity("https://example.com/?p=2", a) {
		t.Fatal("query was stripped")
	}
	b.FormatID = "v2"
	if duplicateIdentity("https://example.com/", a) == duplicateIdentity("https://example.com/", &b) {
		t.Fatal("quality was ignored")
	}
	b = *a
	b.Mode = "cover"
	if duplicateIdentity("https://example.com/", a) == duplicateIdentity("https://example.com/", &b) {
		t.Fatal("output mode was ignored")
	}
	a.Resolver = "xiaohongshu-public"
	a.ResourceID = "xhs-note-image1"
	b = *a
	if duplicateIdentity("https://xhslink.cn/one", a) != duplicateIdentity("https://www.xiaohongshu.com/discovery/item/note", &b) {
		t.Fatal("stable short-link resource should match")
	}
	b.ResourceID = "xhs-note-image2"
	if duplicateIdentity("https://xhslink.cn/one", a) == duplicateIdentity("https://xhslink.cn/one", &b) {
		t.Fatal("different image matched")
	}
}
func TestDuplicateCheckReadsCompleteHistoryWithoutCreatingTasks(t *testing.T) {
	database, err := db.New(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	repository := repo.NewVideoRepository(database)
	svc := NewDownloadTaskService(repository, nil, nil)
	dir := t.TempDir()
	opt := &core.MediaOptions{Version: 1, Mode: "video", SaveDir: dir}
	first, err := svc.AddDownloadTask(&AddDownloadTaskInput{Name: "first.mp4", Type: "youtube-single", URL: "https://example.com/first", Options: opt})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 60; i++ {
		if _, err := svc.AddDownloadTask(&AddDownloadTaskInput{Type: "direct", URL: "https://example.com/other"}); err != nil {
			t.Fatal(err)
		}
	}
	result, err := svc.FindDuplicates([]*AddDownloadTaskInput{{Type: "youtube-single", URL: first.URL, Options: opt}})
	if err != nil || len(result) != 1 || result[0].ID != first.ID {
		t.Fatalf("older match missing: %+v %v", result, err)
	}
	before, _ := svc.GetDownloadTasks(1, 100, "", dir)
	if before.Total != 61 {
		t.Fatalf("read-only check changed tasks: %d", before.Total)
	}
	if err := repository.UpdateStatus([]int64{first.ID}, "failed"); err != nil {
		t.Fatal(err)
	}
	result, err = svc.FindDuplicates([]*AddDownloadTaskInput{{Type: "youtube-single", URL: first.URL, Options: opt}})
	if err != nil || len(result) != 0 {
		t.Fatal("failed task should be retryable")
	}
}
