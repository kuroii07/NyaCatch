//go:build windows

package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestPreviewCancellationClosesExtractorConnection(t *testing.T) {
	binary := os.Getenv("MEDIAGO_TEST_YTDLP")
	if binary == "" {
		t.Skip("set MEDIAGO_TEST_YTDLP to test the actual Windows extractor")
	}
	arrived := make(chan struct{}, 1)
	closed := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case arrived <- struct{}{}:
		default:
		}
		<-r.Context().Done()
		select {
		case closed <- struct{}{}:
		default:
		}
	}))
	defer server.Close()
	source := server.URL + "/pending.mp4"
	// Cleanup is restricted to this executable and this test's unique loopback URL.
	defer func() {
		quote := func(value string) string { return "'" + strings.ReplaceAll(value, "'", "''") + "'" }
		script := "$targetURL=" + quote(source) + "; $targetExe=" + quote(binary) + "; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $targetExe -and $_.CommandLine.Contains($targetURL) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
		_ = exec.Command("powershell.exe", "-NoProfile", "-Command", script).Run()
		server.CloseClientConnections()
	}()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { _, err := (&MediaResolver{Binary: binary}).Resolve(ctx, source); done <- err }()
	select {
	case <-arrived:
	case <-time.After(12 * time.Second):
		t.Fatal("extractor did not request fixture")
	}
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Error("cancelled extraction unexpectedly succeeded")
		}
	case <-time.After(4 * time.Second):
		t.Error("cancellation did not return within four seconds")
	}
	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Error("extractor child remained connected after cancellation")
	}
}
