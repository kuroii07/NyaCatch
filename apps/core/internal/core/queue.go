// Package core contains the task queue implementation
package core

import (
	"context"
	"errors"
	"sync"

	"caorushizi.cn/mediago/internal/logger"
	"go.uber.org/zap"
)

var (
	ErrTaskNotFound      = errors.New("task not found")
	ErrTaskAlreadyActive = errors.New("task is already downloading or queued")
)

// TaskQueue is the task queue, responsible for concurrency control, task scheduling, and event dispatching
type TaskQueue struct {
	downloader Downloader // downloader instance
	maxRunner  int        // maximum concurrency

	mu       sync.RWMutex                  // read-write lock
	queue    []DownloadParams              // pending task queue
	active   map[TaskID]context.CancelFunc // active tasks (task ID -> cancel function)
	settling map[TaskID]bool               // pending stops awaiting terminal persistence; no runner slot
	tasks    map[TaskID]*TaskInfo          // task info table (task ID -> task info)

	// event callback functions
	onStart    func(TaskID)
	onSuccess  func(TaskID)
	onFailed   func(TaskID, error)
	onStopped  func(TaskID)
	onProgress func(ProgressEvent)
	onMessage  func(MessageEvent)
}

// NewTaskQueue creates a new task queue instance
func NewTaskQueue(d Downloader, maxRunner int) *TaskQueue {
	return &TaskQueue{
		downloader: d,
		maxRunner:  max(1, maxRunner),
		active:     make(map[TaskID]context.CancelFunc),
		settling:   make(map[TaskID]bool),
		tasks:      make(map[TaskID]*TaskInfo),
	}
}

func (q *TaskQueue) IsFull() bool {
	q.mu.RLock()
	defer q.mu.RUnlock()
	return len(q.active) >= q.maxRunner
}

func (q *TaskQueue) Downloader() Downloader {
	return q.downloader
}

// SetMaxRunner sets the maximum concurrency
func (q *TaskQueue) SetMaxRunner(n int) {
	q.mu.Lock()
	q.maxRunner = max(1, n)
	q.mu.Unlock()
	q.tryRun()
}

// Enqueue adds a task to the queue
func (q *TaskQueue) Enqueue(p DownloadParams) TaskStatus {
	status, _ := q.TryEnqueue(p)
	return status
}

func (q *TaskQueue) TryEnqueue(p DownloadParams) (TaskStatus, error) {
	q.mu.Lock()
	_, executing := q.active[p.ID]
	if existing, ok := q.tasks[p.ID]; ok && (executing || q.settling[p.ID] || existing.Status == StatusDownloading || existing.Status == StatusPending) {
		status := existing.Status
		q.mu.Unlock()
		return status, ErrTaskAlreadyActive
	}

	// initialize task info
	q.tasks[p.ID] = &TaskInfo{
		ID:      p.ID,
		Type:    p.Type,
		URL:     p.URL,
		Name:    p.Name,
		Status:  StatusPending,
		Percent: 0,
		Speed:   "",
		IsLive:  false,
	}

	if len(q.active) < q.maxRunner {
		q.tasks[p.ID].Status = StatusDownloading
		ctx, cancel := context.WithCancel(context.Background())
		q.active[p.ID] = cancel
		q.mu.Unlock()

		logger.Info("Task started immediately", zap.String("id", string(p.ID)))
		go q.execute(p, ctx)
		return StatusDownloading, nil
	} else {
		q.queue = append(q.queue, p)
		queueLen := len(q.queue)
		q.mu.Unlock()

		logger.Info("Task enqueued",
			zap.String("id", string(p.ID)),
			zap.Int("queueLength", queueLen))
		return StatusPending, nil
	}
}

// Stop stops the specified task
func (q *TaskQueue) Stop(id TaskID) error {
	q.mu.Lock()
	for index, p := range q.queue {
		if p.ID == id {
			q.queue = append(q.queue[:index], q.queue[index+1:]...)
			q.tasks[id].Status = StatusStopped
			q.settling[id] = true
			q.mu.Unlock()
			if q.onStopped != nil {
				q.onStopped(id)
			}
			q.mu.Lock()
			delete(q.settling, id)
			q.mu.Unlock()
			return nil
		}
	}
	cancel, ok := q.active[id]
	q.mu.Unlock()

	if !ok {
		logger.Warn("Attempted to stop non-existent task", zap.String("id", string(id)))
		return ErrTaskNotFound
	}

	logger.Info("Stopping task", zap.String("id", string(id)))
	// invoke the cancel function
	cancel()
	return nil
}

// tryRun attempts to run tasks from the queue
func (q *TaskQueue) tryRun() {
	q.mu.Lock()
	defer q.mu.Unlock()

	for len(q.active) < q.maxRunner && len(q.queue) > 0 {
		task := q.queue[0]
		q.queue = q.queue[1:]

		q.tasks[task.ID].Status = StatusDownloading
		ctx, cancel := context.WithCancel(context.Background())
		q.active[task.ID] = cancel

		go q.execute(task, ctx)
	}
}

// execute runs a single download task
func (q *TaskQueue) execute(p DownloadParams, ctx context.Context) {
	logger.Info("Executing task",
		zap.String("id", string(p.ID)),
		zap.String("type", string(p.Type)))

	// update task status to downloading
	q.mu.Lock()
	if task, ok := q.tasks[p.ID]; ok {
		task.Status = StatusDownloading
	}
	q.mu.Unlock()

	// emit start event
	if q.onStart != nil {
		q.onStart(p.ID)
	}

	// execute the download
	err := q.downloader.Download(ctx, p, Callbacks{
		OnOutput: func(path string) {
			q.mu.Lock()
			if task, ok := q.tasks[p.ID]; ok {
				task.OutputPath = path
			}
			q.mu.Unlock()
		},
		OnProgress: func(e ProgressEvent) {
			// update task progress info
			q.mu.Lock()
			if task, ok := q.tasks[p.ID]; ok {
				task.Percent = e.Percent
				task.Speed = e.Speed
				task.IsLive = e.IsLive
			}
			q.mu.Unlock()

			if q.onProgress != nil {
				q.onProgress(e)
			}
		},
		OnMessage: func(m MessageEvent) {
			if q.onMessage != nil {
				q.onMessage(m)
			}
		},
	})
	if ctx.Err() != nil {
		err = ctx.Err()
	}

	// dispatch the appropriate event and update task status based on error type
	switch {
	case err == nil:
		// completed successfully
		logger.Info("Task completed successfully", zap.String("id", string(p.ID)))
		q.mu.Lock()
		if task, ok := q.tasks[p.ID]; ok {
			task.Status = StatusSuccess
			task.Percent = 100
		}
		q.mu.Unlock()
		if q.onSuccess != nil {
			q.onSuccess(p.ID)
		}
	case errors.Is(err, context.Canceled):
		// cancelled
		logger.Info("Task was stopped", zap.String("id", string(p.ID)))
		q.mu.Lock()
		if task, ok := q.tasks[p.ID]; ok {
			task.Status = StatusStopped
		}
		q.mu.Unlock()
		if q.onStopped != nil {
			q.onStopped(p.ID)
		}
	default:
		// failed
		logger.Error("Task failed",
			zap.String("id", string(p.ID)),
			zap.Error(err))
		q.mu.Lock()
		if task, ok := q.tasks[p.ID]; ok {
			task.Status = StatusFailed
			task.Error = err.Error()
		}
		q.mu.Unlock()
		if q.onFailed != nil {
			q.onFailed(p.ID, err)
		}
	}

	// Keep the task reserved until terminal callbacks finish persisting state.
	// A retry admitted earlier could have its new status overwritten by this run.
	q.mu.Lock()
	if cancel := q.active[p.ID]; cancel != nil {
		cancel()
	}
	delete(q.active, p.ID)
	q.mu.Unlock()
	q.tryRun()
}

// IsActive also covers the brief terminal-persistence window after execution.
func (q *TaskQueue) IsActive(id TaskID) bool {
	q.mu.RLock()
	defer q.mu.RUnlock()
	if _, ok := q.active[id]; ok || q.settling[id] {
		return true
	}
	task, ok := q.tasks[id]
	return ok && task.Status == StatusPending
}

// Event hook registration methods (for use by the API layer)

func (q *TaskQueue) OnStart(fn func(TaskID)) {
	q.onStart = fn
}

func (q *TaskQueue) OnSuccess(fn func(TaskID)) {
	q.onSuccess = fn
}

func (q *TaskQueue) OnFailed(fn func(TaskID, error)) {
	q.onFailed = fn
}

func (q *TaskQueue) OnStopped(fn func(TaskID)) {
	q.onStopped = fn
}

func (q *TaskQueue) OnProgress(fn func(ProgressEvent)) {
	q.onProgress = fn
}

func (q *TaskQueue) OnMessage(fn func(MessageEvent)) {
	q.onMessage = fn
}

// GetTask retrieves information about the specified task
func (q *TaskQueue) GetTask(id TaskID) (*TaskInfo, bool) {
	q.mu.RLock()
	defer q.mu.RUnlock()
	task, ok := q.tasks[id]
	if !ok {
		return nil, false
	}
	// return a copy to prevent external modification
	taskCopy := *task
	return &taskCopy, true
}

// GetAllTasks retrieves information about all tasks
func (q *TaskQueue) GetAllTasks() []TaskInfo {
	q.mu.RLock()
	defer q.mu.RUnlock()

	tasks := make([]TaskInfo, 0, len(q.tasks))
	for _, task := range q.tasks {
		tasks = append(tasks, *task)
	}
	return tasks
}
