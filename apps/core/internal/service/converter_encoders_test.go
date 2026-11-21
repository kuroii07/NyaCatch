package service

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"caorushizi.cn/mediago/internal/core"
)

func TestCompressionEncoderFailureCacheAndCancellation(t *testing.T) {
	c := NewConverter(filepath.Join(t.TempDir(), "missing-ffmpeg"))
	status, err := c.CompressionEncoders(context.Background(), false)
	if err != nil || status.H264.Available || status.HEVC.Available {
		t.Fatal(status, err)
	}
	checked := c.encoderChecked
	if _, err = c.CompressionEncoders(context.Background(), false); err != nil || !c.encoderChecked.Equal(checked) {
		t.Fatal("cache not reused", err)
	}
	c.encoderChecked = time.Now().Add(-2 * time.Minute)
	checked = c.encoderChecked
	if _, err = c.CompressionEncoders(context.Background(), true); err != nil || !c.encoderChecked.After(checked) {
		t.Fatal("explicit refresh not run", err)
	}
	c.slots <- struct{}{}
	c.slots <- struct{}{}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	checked = c.encoderChecked
	if _, err = c.CompressionEncoders(ctx, true); err == nil || !c.encoderChecked.Equal(checked) {
		t.Fatal("cancelled busy probe cached", err)
	}
	<-c.slots
	<-c.slots
	if len(c.encoderGate) != 0 {
		t.Fatal("probe gate leaked")
	}
	if err = c.checkCompressionEncoder(&core.CompressionOptions{Encoder: "nvenc", Codec: "h264"}); err == nil || !strings.Contains(err.Error(), "unavailable") {
		t.Fatal(err)
	}
}

func TestCompressionCopiedAudioTrialTimeline(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	input := filepath.Join(dir, "audio-preroll.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=4", "-f", "lavfi", "-i", "sine=duration=4", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", input)
	c := NewConverter(bin)
	for i, format := range []string{"mp4", "mkv"} {
		o := &core.ConversionOptions{Version: 1, Compress: &core.CompressionOptions{Codec: "h264", CRF: 23, Preset: "fast", Audio: "copy", Trial: &core.TrimRange{StartMs: 1500, EndMs: 3500}}}
		out, err := c.Start(int64(7590+i), input, format, "medium", nil, o)
		if err != nil {
			t.Fatal(format, err)
		}
		actual, err := c.inspectCompression(context.Background(), out)
		if err != nil || actual.duration < 1900*time.Millisecond || actual.duration > 2100*time.Millisecond {
			t.Fatal(actual, err)
		}
	}
}

func TestCompressionEncoderArguments(t *testing.T) {
	for _, codec := range []string{"h264", "hevc"} {
		for _, p := range []string{"fast", "medium", "slow"} {
			cq := 23
			text := strings.Join(compressionVideoArgs(&core.CompressionOptions{Encoder: "nvenc", Codec: codec, CQ: &cq, Preset: p}), " ")
			encoder := "h264_nvenc"
			if codec == "hevc" {
				encoder = "hevc_nvenc"
			}
			if !strings.Contains(text, "-c:v "+encoder) || !strings.Contains(text, "-preset "+map[string]string{"fast": "p2", "medium": "p4", "slow": "p6"}[p]) || !strings.Contains(text, "-rc vbr -cq 23 -b:v 0") || strings.Contains(text, "-crf") || strings.Contains(text, "x265-params") {
				t.Fatal(text)
			}
		}
	}
}

func TestCompressionNVENCRealOutputs(t *testing.T) {
	if os.Getenv("NYACATCH_TEST_NVENC") != "1" {
		t.Skip("explicit local NVIDIA validation only")
	}
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Fatal("missing FFmpeg")
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "黑色 原视频.mp4")
	sub := filepath.Join(dir, "字幕 #.srt")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "color=black:s=640x360:r=24:d=4", "-f", "lavfi", "-i", "sine=duration=4", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", source)
	if err := os.WriteFile(sub, []byte(subtitleSRT), 0600); err != nil {
		t.Fatal(err)
	}
	c := NewConverter(bin)
	status, err := c.CompressionEncoders(context.Background(), true)
	if err != nil || !status.H264.Available || !status.HEVC.Available {
		t.Fatal("real NVIDIA initialization failed", status, err)
	}
	id := int64(7600)
	for _, codec := range []string{"h264", "hevc"} {
		for _, format := range []string{"mp4", "mkv"} {
			for _, preset := range []string{"fast", "medium", "slow"} {
				id++
				cq := 23
				o := &core.ConversionOptions{Version: 1, MaxEdge: 320, Compress: &core.CompressionOptions{Encoder: "nvenc", Codec: codec, CQ: &cq, Preset: preset, Audio: "copy", FPS: 30, Subtitle: testSub(sub), Trial: &core.TrimRange{StartMs: 1500, EndMs: 3500}}}
				if _, err = c.prepareCompression(source, format, o); err != nil {
					t.Fatal(err)
				}
				start := time.Now()
				out, err := c.Start(id, source, format, "medium", nil, o)
				if err != nil {
					t.Fatal(codec, format, preset, err)
				}
				actual, err := c.inspectCompression(context.Background(), out)
				if err != nil || actual.videoCodec != codec || actual.audioCodec != "aac" || actual.width != 320 || actual.height != 180 || actual.duration < 1900*time.Millisecond || actual.duration > 2300*time.Millisecond {
					t.Fatal(actual, err)
				}
				// Decode the burned frame: white subtitle pixels must exist on black video.
				pixels := fixtureCommand(t, bin, "-v", "error", "-ss", "0.2", "-i", out, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1")
				bright := 0
				for i := 0; i+2 < len(pixels); i += 3 {
					if pixels[i] > 160 && pixels[i+1] > 160 && pixels[i+2] > 160 {
						bright++
					}
				}
				if bright < 30 {
					t.Fatal("subtitle missing from NVIDIA output", bright)
				}
				fixtureCommand(t, bin, "-v", "error", "-i", out, "-f", "null", "-")
				t.Log(codec, format, preset, "elapsed", time.Since(start), "subtitle pixels", bright)
			}
		}
	}
	// Stop after FFmpeg has reported real encoding progress, rather than only
	// cancelling a queued request. Cancellation must not suggest a driver fault.
	id++
	cq := 23
	o := &core.ConversionOptions{Version: 1, Compress: &core.CompressionOptions{Encoder: "nvenc", Codec: "hevc", CQ: &cq, Preset: "slow", Audio: "aac", Bitrate: 192}}
	cancelled := false
	out, err := c.Start(id, source, "mp4", "medium", func(int) {
		if !cancelled {
			cancelled = c.Stop(id)
		}
	}, o)
	if !cancelled || err == nil || out != "" || !strings.Contains(err.Error(), "cancelled") || strings.Contains(err.Error(), "driver") {
		t.Fatal("active GPU cancellation was reported incorrectly", out, err, cancelled)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".nyacatch-compress-") {
			t.Fatal("cancelled GPU workspace leaked")
		}
	}
}
