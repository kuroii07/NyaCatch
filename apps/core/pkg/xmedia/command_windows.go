//go:build windows

package xmedia

import (
	"os/exec"
	"syscall"
)

// ffprobe is a single process; CommandContext kills it on cancellation.
func configureProbe(cmd *exec.Cmd) { cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }
