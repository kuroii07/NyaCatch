package service

import (
	"caorushizi.cn/mediago/internal/db"
	"caorushizi.cn/mediago/internal/db/repo"
	"path/filepath"
	"strings"
	"testing"
)

func TestDuplicateMediaDownloadsKeepExtension(t *testing.T) {
	database, err := db.New(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	svc := NewDownloadTaskService(repo.NewVideoRepository(database), nil, nil)
	for _, ext := range []string{".mp4", ".m4a"} {
		input := &AddDownloadTaskInput{Name: "Flower" + ext, Type: "youtube-single", URL: "https://example.com/flower"}
		first, err := svc.AddDownloadTask(input)
		if err != nil {
			t.Fatal(err)
		}
		second, err := svc.AddDownloadTasks([]*AddDownloadTaskInput{input})
		if err != nil {
			t.Fatal(err)
		}
		if first.Name == second[0].Name || !strings.HasSuffix(second[0].Name, ext) {
			t.Errorf("duplicate filename lost %s: %q", ext, second[0].Name)
		}
	}
}
