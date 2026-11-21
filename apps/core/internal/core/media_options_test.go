package core

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestMediaOptionsRejectUnsafeSelections(t *testing.T) {
	valid := MediaOptions{Version: 1, Mode: "video", FormatID: "v1080", AudioFormatID: "a1", SaveDir: t.TempDir()}
	if err := valid.Validate(); err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*MediaOptions){func(o *MediaOptions) { o.Version = 9 }, func(o *MediaOptions) { o.Mode = "exec" }, func(o *MediaOptions) { o.FormatID = "best;--exec=x" }, func(o *MediaOptions) { o.FormatID = "--exec" }, func(o *MediaOptions) { o.AudioFormatID = "a+b" }, func(o *MediaOptions) { o.SaveDir = "../outside" }, func(o *MediaOptions) { o.Container = "exe" }, func(o *MediaOptions) { o.Mode = "audio"; o.AudioFormat = "mp3"; o.AudioBitrate = 999 }} {
		candidate := valid
		change(&candidate)
		if candidate.Validate() == nil {
			t.Fatalf("accepted unsafe selection: %+v", candidate)
		}
	}
}

func TestMediaArgumentsPreserveSelectionAndLiteralFilename(t *testing.T) {
	dir := t.TempDir()
	p := DownloadParams{URL: "https://example.com/watch?v=1&list=2", Name: "中文 100% clip.mp4", Options: &MediaOptions{Version: 1, Mode: "video", FormatID: "v1", AudioFormatID: "a1", SaveDir: dir, Container: "mp4"}}
	args, err := BuildMediaArguments(p, dir, filepath.Join(dir, "report.json"), "")
	if err != nil {
		t.Fatal(err)
	}
	format := slices.Index(args, "--format")
	if format < 0 || args[format+1] != "v1+a1" {
		t.Fatalf("format fell back: %v", args)
	}
	output := slices.Index(args, "--output")
	if output < 0 || !strings.Contains(args[output+1], "100%% clip.%(ext)s") {
		t.Fatalf("filename became a template: %v", args)
	}
	for _, flag := range []string{"--ignore-config", "--no-playlist", "--no-overwrites", "--print-to-file", "--ffmpeg-location"} {
		if !slices.Contains(args, flag) {
			t.Errorf("missing %s", flag)
		}
	}
	if args[len(args)-2] != "--" || args[len(args)-1] != p.URL {
		t.Fatal("source is not a single final URL argument")
	}
	p.Options.Mode = "audio"
	p.Options.AudioFormat = "mp3"
	p.Options.AudioBitrate = 192
	args, err = BuildMediaArguments(p, dir, "report", "")
	if err != nil {
		t.Fatal(err)
	}
	i := slices.Index(args, "--audio-quality")
	if i < 0 || args[i+1] != "192K" || !slices.Contains(args, "--extract-audio") {
		t.Fatalf("MP3 not converted: %v", args)
	}
	p.Options.Mode = "cover"
	p.Options.AudioFormat = ""
	p.Options.AudioBitrate = 0
	args, err = BuildMediaArguments(p, dir, "report", "")
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(args, "--skip-download") || !slices.Contains(args, "--write-thumbnail") || slices.Contains(args, "--extract-audio") {
		t.Fatalf("cover may download video: %v", args)
	}
}

func TestReportedOutputMustExistInsideSnapshotDirectory(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "clip.mp4")
	if err := os.WriteFile(file, []byte("actual-media"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := ValidateMediaOutput(dir, file); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "outside.mp4")
	os.WriteFile(outside, []byte("wrong"), 0600)
	for _, candidate := range []string{outside, filepath.Join(dir, "missing.mp4"), dir} {
		if _, err := ValidateMediaOutput(dir, candidate); err == nil {
			t.Errorf("invalid success path: %s", candidate)
		}
	}
}

func TestOutputNamesPreserveDottedStemAndWindowsReservedNames(t *testing.T) {
	if got := SanitizeFilename("NUL.mp4"); got != "_NUL.mp4" {
		t.Errorf("reserved Windows name: %q", got)
	}
	p := DownloadParams{URL: "https://example.com/watch", Name: "clip.v1", Options: &MediaOptions{Version: 1, Mode: "cover", SaveDir: t.TempDir()}}
	args, err := BuildMediaArguments(p, ".", "report", "")
	if err != nil {
		t.Fatal(err)
	}
	i := slices.Index(args, "--output")
	if args[i+1] != "clip.v1.%(ext)s" {
		t.Fatalf("dotted stem truncated: %q", args[i+1])
	}
}
