//go:build windows

package runner

import (
	"context"
	"errors"
	"fmt"
	"golang.org/x/sys/windows"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestRunnerProcessHelper(t *testing.T) {
	marker := -1
	for i, a := range os.Args {
		if a == "--runner-helper" {
			marker = i
			break
		}
	}
	if marker < 0 {
		return
	}
	mode, dir := os.Args[marker+1], os.Args[marker+2]
	_ = os.WriteFile(filepath.Join(dir, mode+".pid"), []byte(strconv.Itoa(os.Getpid())), 0600)
	if mode == "parent" {
		exe, _ := os.Executable()
		child := exec.Command(exe, "-test.run=TestRunnerProcessHelper", "--", "--runner-helper", "child", dir)
		if err := child.Start(); err != nil {
			os.Exit(2)
		}
	}
	for {
		time.Sleep(time.Second)
	}
}

func processAlive(pid int) bool {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return false
	}
	defer windows.CloseHandle(h)
	var code uint32
	return windows.GetExitCodeProcess(h, &code) == nil && code == 259
}

func TestCancellationStopsOwnedProcessTree(t *testing.T) {
	for _, kind := range []string{"pty", "pipe"} {
		t.Run(kind, func(t *testing.T) {
			dir := t.TempDir()
			exe, _ := os.Executable()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done := make(chan error, 1)
			go func() {
				args := []string{"-test.run=TestRunnerProcessHelper", "--", "--runner-helper", "parent", dir}
				if kind == "pty" {
					done <- NewPTYRunner().Run(ctx, exe, args, nil)
				} else {
					done <- NewExecRunner().Run(ctx, exe, args, nil)
				}
			}()
			pids := []int{}
			defer func() {
				for _, pid := range pids {
					if h, e := windows.OpenProcess(windows.PROCESS_TERMINATE, false, uint32(pid)); e == nil {
						windows.TerminateProcess(h, 1)
						windows.CloseHandle(h)
					}
				}
			}()
			until := time.Now().Add(8 * time.Second)
			for _, mode := range []string{"parent", "child"} {
				for {
					b, e := os.ReadFile(filepath.Join(dir, mode+".pid"))
					if e == nil {
						pid, _ := strconv.Atoi(strings.TrimSpace(string(b)))
						pids = append(pids, pid)
						break
					}
					if time.Now().After(until) {
						t.Fatal("helper not ready")
					}
					time.Sleep(40 * time.Millisecond)
				}
			}
			cancel()
			select {
			case err := <-done:
				if !errors.Is(err, context.Canceled) {
					t.Errorf("cancel error: %v", err)
				}
			case <-time.After(5 * time.Second):
				t.Error("runner did not return after cancellation")
			}
			time.Sleep(150 * time.Millisecond)
			for _, pid := range pids {
				if processAlive(pid) {
					t.Error(fmt.Sprintf("owned process remains alive: %d", pid))
				}
			}
		})
	}
}
