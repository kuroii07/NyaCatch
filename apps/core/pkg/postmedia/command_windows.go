package postmedia

import (
	"os/exec"
	"syscall"
)

func configureCommand(c *exec.Cmd) { c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }
