package core

import (
	"caorushizi.cn/mediago/internal/logger"
	"context"
	"errors"
	"go.uber.org/zap"
	"testing"
	"time"
)

type blockingMediaDownloader struct {
	started chan TaskID
	release chan struct{}
}

func (d *blockingMediaDownloader) Config() interface{} { return nil }
func (d *blockingMediaDownloader) Download(ctx context.Context, p DownloadParams, cb Callbacks) error {
	d.started <- p.ID
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-d.release:
		if cb.OnOutput != nil {
			cb.OnOutput("verified-output.mp4")
		}
		return nil
	}
}

func TestQueueRejectsDuplicateAndStopsWaitingTask(t *testing.T) {
	logger.Logger = zap.NewNop()
	logger.Sugar = logger.Logger.Sugar()
	d := &blockingMediaDownloader{started: make(chan TaskID, 4), release: make(chan struct{})}
	q := NewTaskQueue(d, 1)
	if _, err := q.TryEnqueue(DownloadParams{ID: "1"}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-d.started:
	case <-time.After(time.Second):
		t.Fatal("first task did not start")
	}
	if _, err := q.TryEnqueue(DownloadParams{ID: "1"}); !errors.Is(err, ErrTaskAlreadyActive) {
		t.Fatalf("duplicate task was admitted: %v", err)
	}
	if s, err := q.TryEnqueue(DownloadParams{ID: "2"}); err != nil || s != StatusPending {
		t.Fatalf("waiting enqueue: %v %v", s, err)
	}
	if err := q.Stop("2"); err != nil {
		t.Fatal(err)
	}
	if task, _ := q.GetTask("2"); task.Status != StatusStopped {
		t.Fatal("waiting task was not stopped")
	}
	done := make(chan struct{}, 1)
	q.OnSuccess(func(TaskID) { done <- struct{}{} })
	close(d.release)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("first task did not complete")
	}
	select {
	case id := <-d.started:
		t.Fatalf("stopped or duplicate task ran: %s", id)
	case <-time.After(50 * time.Millisecond):
	}
	task, _ := q.GetTask("1")
	if task.OutputPath != "verified-output.mp4" {
		t.Fatal("final output path lost before success callback")
	}
}

func TestIncreasingConcurrencyFillsAllAvailableSlots(t *testing.T) {
	logger.Logger = zap.NewNop()
	logger.Sugar = logger.Logger.Sugar()
	d := &blockingMediaDownloader{started: make(chan TaskID, 5), release: make(chan struct{})}
	defer close(d.release)
	q := NewTaskQueue(d, 1)
	for _, id := range []TaskID{"1", "2", "3", "4"} {
		if _, err := q.TryEnqueue(DownloadParams{ID: id}); err != nil {
			t.Fatal(err)
		}
	}
	q.SetMaxRunner(4)
	for i := 0; i < 4; i++ {
		select {
		case <-d.started:
		case <-time.After(time.Second):
			t.Fatalf("only %d of 4 slots filled", i)
		}
	}
}

func TestRetryCannotRaceTerminalCallback(t *testing.T) {
	logger.Logger = zap.NewNop()
	logger.Sugar = logger.Logger.Sugar()
	d := &blockingMediaDownloader{started: make(chan TaskID, 3), release: make(chan struct{})}
	q := NewTaskQueue(d, 1)
	callbackEntered := make(chan struct{})
	callbackRelease := make(chan struct{})
	defer close(callbackRelease)
	q.OnStopped(func(TaskID) { close(callbackEntered); <-callbackRelease })
	q.TryEnqueue(DownloadParams{ID: "1"})
	<-d.started
	if err := q.Stop("1"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-callbackEntered:
	case <-time.After(time.Second):
		t.Fatal("stop callback did not run")
	}
	if _, err := q.TryEnqueue(DownloadParams{ID: "1"}); !errors.Is(err, ErrTaskAlreadyActive) {
		t.Fatalf("retry admitted before previous terminal state was persisted: %v", err)
	}
}

func TestPendingStopReservesTaskUntilCallbackReturns(t *testing.T) {
	logger.Logger = zap.NewNop()
	logger.Sugar = logger.Logger.Sugar()
	d := &blockingMediaDownloader{started: make(chan TaskID, 3), release: make(chan struct{})}
	defer close(d.release)
	q := NewTaskQueue(d, 1)
	entered, release, stopped := make(chan struct{}), make(chan struct{}), make(chan struct{})
	q.OnStopped(func(TaskID) { close(entered); <-release })
	q.TryEnqueue(DownloadParams{ID: "1"})
	<-d.started
	q.TryEnqueue(DownloadParams{ID: "2"})
	go func() { _ = q.Stop("2"); close(stopped) }()
	<-entered
	active := q.IsActive("2")
	_, err := q.TryEnqueue(DownloadParams{ID: "2"})
	close(release)
	<-stopped
	if !active || !errors.Is(err, ErrTaskAlreadyActive) {
		t.Fatalf("pending stop can race retry/delete: active=%v error=%v", active, err)
	}
	if q.IsActive("2") {
		t.Fatal("stopped task remained reserved after persistence")
	}
	if _, err := q.TryEnqueue(DownloadParams{ID: "2"}); err != nil {
		t.Fatalf("retry rejected after callback: %v", err)
	}
}
