//go:build !windows

package postmedia

import "os/exec"

func configureCommand(c *exec.Cmd) {}
