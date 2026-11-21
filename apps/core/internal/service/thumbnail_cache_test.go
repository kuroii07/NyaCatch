package service

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestThumbnailCacheClearPreservesUnknownAndActive(t *testing.T) {
	root := t.TempDir()
	name := "1-" + strings.Repeat("a", 64) + ".image"
	active := "2-" + strings.Repeat("b", 64) + ".image"
	for _, file := range []string{name, active, "unknown.image", ".thumbnail-temp"} {
		if err := os.WriteFile(filepath.Join(root, file), []byte("abc"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(root, "3-"+strings.Repeat("c", 64)+".image"), 0700); err != nil {
		t.Fatal(err)
	}
	s := &TaskThumbnailService{cacheDir: root, active: map[string]int{filepath.Join(root, active): 1}}
	info, err := s.CacheInfo()
	if err != nil || info.Files != 2 || info.Bytes != 6 || info.Busy != 1 {
		t.Fatalf("info %+v %v", info, err)
	}
	info, err = s.ClearCache()
	if err != nil || info.Files != 1 || info.Bytes != 3 {
		t.Fatalf("clear %+v %v", info, err)
	}
	if _, err = os.Stat(filepath.Join(root, name)); !os.IsNotExist(err) {
		t.Fatal("managed completed cache survived")
	}
	for _, file := range []string{active, "unknown.image", ".thumbnail-temp"} {
		if _, err = os.Stat(filepath.Join(root, file)); err != nil {
			t.Fatal(err)
		}
	}
}
func TestThumbnailCacheClearDuringGeneration(t *testing.T) {
	tasks, s := thumbnailServices(t)
	entered := make(chan struct{})
	resume := make(chan struct{})
	image := thumbnailPNG(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(entered); <-resume; w.Write(image) }))
	defer server.Close()
	cover := server.URL
	task, err := tasks.AddDownloadTask(&AddDownloadTaskInput{Name: "active.mp4", URL: "https://example.com/active", Type: "youtube-single", Thumbnail: &cover})
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error)
	go func() { _, _, err := s.Get(context.Background(), task.ID); done <- err }()
	<-entered
	info, err := s.ClearCache()
	close(resume)
	if err != nil || info.Busy != 1 {
		t.Fatalf("active clear %+v %v", info, err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	cache := filepath.Join(s.cacheDir, fmt.Sprintf("%d-%x.image", task.ID, sha256.Sum256([]byte(task.URL))))
	if _, err = os.Stat(cache); err != nil {
		t.Fatal(err)
	}
	info, err = s.ClearCache()
	if err != nil || info.Files != 0 || info.Busy != 0 {
		t.Fatalf("final %+v %v", info, err)
	}
}
func TestThumbnailCacheRejectsRootLink(t *testing.T) {
	parent := t.TempDir()
	target := t.TempDir()
	link := filepath.Join(parent, "cache")
	if err := os.Symlink(target, link); err != nil {
		t.Skip("symlink unavailable")
	}
	s := &TaskThumbnailService{cacheDir: link}
	if _, err := s.ClearCache(); err == nil {
		t.Fatal("cache root link accepted")
	}
}
