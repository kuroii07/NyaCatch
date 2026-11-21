//go:build !windows

package xmedia

import "os/exec"

func configureProbe(cmd *exec.Cmd) {}
