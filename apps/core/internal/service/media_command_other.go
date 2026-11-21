//go:build !windows

package service

import "os/exec"

func configureMediaCommand(command *exec.Cmd) {}
