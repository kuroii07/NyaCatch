package service

import (
	"caorushizi.cn/mediago/internal/db"
	"caorushizi.cn/mediago/internal/db/repo"
	"path/filepath"
	"testing"
)

func TestStartupRecoveryStopsInterruptedTasksWithoutStartingReadyTasks(t *testing.T) {
	database, err := db.New(filepath.Join(t.TempDir(), "recovery.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	svc := NewDownloadTaskService(repo.NewVideoRepository(database), nil, nil)
	states := []string{"ready", "pending", "downloading", "stopped", "success", "failed"}
	for _, state := range states {
		task, e := svc.AddDownloadTask(&AddDownloadTaskInput{Name: state, Type: "youtube", URL: "https://example.com/clip"})
		if e != nil {
			t.Fatal(e)
		}
		if e = svc.SetStatus([]int64{task.ID}, state); e != nil {
			t.Fatal(e)
		}
	}
	if err = svc.RecoverInterruptedTasks(); err != nil {
		t.Fatal(err)
	}
	tasks, err := svc.GetDownloadTasks(1, 20, "", "")
	if err != nil {
		t.Fatal(err)
	}
	for _, task := range tasks.List {
		want := task.Name
		if want == "pending" || want == "downloading" {
			want = "stopped"
		}
		if task.Status != want {
			t.Errorf("%s became %s, want %s", task.Name, task.Status, want)
		}
	}
}
