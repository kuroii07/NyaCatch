package service

import (
	"bytes"
	"caorushizi.cn/mediago/internal/core"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCompressionTwoPassTargets(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	input := filepath.Join(dir, "原视频 ' #.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=480x270:r=24:d=8", "-f", "lavfi", "-i", "sine=frequency=440:duration=8", "-c:v", "libx264", "-crf", "6", "-c:a", "aac", "-threads", "1", input)
	before, _ := os.ReadFile(input)
	c := NewConverter(bin)
	id := int64(7300)
	for _, codec := range []string{"h264", "hevc"} {
		for _, format := range []string{"mp4", "mkv"} {
			id++
			o := &core.ConversionOptions{Version: 1, Compress: &core.CompressionOptions{Codec: codec, TargetBytes: 1000000, Preset: "fast", Audio: "aac", Bitrate: 128}}
			progress := []int{}
			out, err := c.Start(id, input, format, "medium", func(p int) { progress = append(progress, p) }, o)
			if err != nil {
				t.Fatal(codec, format, err)
			}
			stat, _ := os.Stat(out)
			if stat.Size() > 1000000 || stat.Size() < 300000 {
				t.Fatal("unexpected target output", codec, format, stat.Size())
			}
			actual, err := c.inspectCompression(context.Background(), out)
			if err != nil || actual.videoCodec != codec || actual.audioCodec != "aac" || actual.width != 480 || actual.height != 270 {
				t.Fatal(actual, err)
			}
			sawSecond := false
			for i, p := range progress {
				if p >= 45 {
					sawSecond = true
				}
				if p < 0 || p > 99 || (i > 0 && p < progress[i-1]) {
					t.Fatal("non-monotonic two-pass progress", progress)
				}
			}
			if !sawSecond {
				t.Fatal("second pass not reported")
			}
			// A trial keeps the full video's rate budget instead of spending 1 MB on two seconds.
			o.Compress.Trial = &core.TrimRange{StartMs: 2000, EndMs: 4000}
			trial, err := c.Start(id+100, input, format, "medium", nil, o)
			if err != nil {
				t.Fatal(err)
			}
			trialStat, _ := os.Stat(trial)
			if trialStat.Size() > 600000 {
				t.Fatal("trial used whole-video target", trialStat.Size())
			}
		}
	}
	for _, codec := range []string{"h264", "hevc"} {
		id++
		o := &core.ConversionOptions{Version: 1, Compress: &core.CompressionOptions{Codec: codec, TargetBytes: 1000000, Preset: "fast", Audio: "aac", Bitrate: 128}}
		if _, err := c.Start(id, input, "mp4", "medium", func(p int) {
			if p >= 45 {
				c.Stop(id)
			}
		}, o); err == nil {
			t.Fatal("cancel at pass boundary succeeded")
		}
		if _, err := c.Start(id, input, "mp4", "medium", nil, o); err != nil {
			t.Fatal("same-ID retry", err)
		}
	}
	if got, _ := os.ReadFile(input); !bytes.Equal(got, before) {
		t.Fatal("source changed")
	}
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".nyacatch-compress-") || strings.Contains(entry.Name(), "pass-stats") {
			t.Fatal("pass statistics leaked")
		}
	}
}
