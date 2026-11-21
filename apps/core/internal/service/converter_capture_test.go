package service

import (
	"bytes"
	"caorushizi.cn/mediago/internal/core"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestCaptureRealFramesGIFAndProtection(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	video := filepath.Join(dir, "颜色 ' #.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "color=red:s=96x64:r=10:d=2", "-f", "lavfi", "-i", "color=blue:s=96x64:r=10:d=2", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-c:v", "libx264", "-threads", "1", video)
	before, _ := os.ReadFile(video)
	converter := NewConverter(bin)
	for i, format := range []string{"png", "jpg", "webp"} {
		o := &core.ConversionOptions{Version: 1, Capture: &core.CaptureRange{StartMs: 2250, Name: "画面"}}
		existing := filepath.Join(dir, "画面."+format)
		os.WriteFile(existing, []byte("keep"), 0600)
		out, err := converter.Start(int64(6000+i), video, format, "high", nil, o)
		if err != nil {
			t.Fatal(err)
		}
		if out == video || out == existing {
			t.Fatal("unsafe output path")
		}
		rgb := fixtureCommand(t, bin, "-v", "error", "-i", out, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
		if len(rgb) != 96*64*3 || rgb[2] < 180 || rgb[0] > 40 {
			t.Fatal("frame is not the selected blue video frame")
		}
		if format == "png" {
			expected := fixtureCommand(t, bin, "-v", "error", "-ss", "2.250", "-i", video, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
			if !bytes.Equal(rgb, expected) {
				t.Fatal("PNG pixel mismatch")
			}
		}
		if got, _ := os.ReadFile(existing); string(got) != "keep" {
			t.Fatal("existing image changed")
		}
	}
	o := &core.ConversionOptions{Version: 1, MaxEdge: 160, Capture: &core.CaptureRange{StartMs: 1500, EndMs: 3500, FPS: 10, Loop: true}}
	for i, loop := range []bool{true, false} {
		o.Capture.Loop = loop
		out, err := converter.Start(int64(6010+i), video, "gif", "high", nil, o)
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := os.ReadFile(out)
		if bytes.Contains(raw, []byte("NETSCAPE2.0")) != loop {
			t.Fatal("incorrect loop metadata")
		}
		info, err := converter.inspectMergeSource(context.Background(), out)
		if err != nil || info.width != 96 || info.height != 64 {
			t.Fatalf("unexpected GIF metadata %+v %v", info, err)
		}
		frames := fixtureCommand(t, bin, "-v", "error", "-ignore_loop", "1", "-i", out, "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
		size := 96 * 64 * 3
		if len(frames) != 20*size || frames[0] < 180 || frames[2] > 40 || frames[len(frames)-3] > 40 || frames[len(frames)-1] < 180 {
			t.Fatalf("GIF frame count/order wrong count=%d first=%v last=%v", len(frames)/size, frames[:3], frames[len(frames)-3:])
		}
	}
	wave := filepath.Join(dir, "audio.wav")
	writeTrimWave(t, wave)
	if _, err := converter.Start(6020, wave, "png", "high", nil, &core.ConversionOptions{Version: 1, Capture: &core.CaptureRange{}}); err == nil {
		t.Fatal("audio accepted for frame")
	}
	o.Capture.StartMs = 4000
	o.Capture.EndMs = 4500
	if _, err := converter.Start(6021, video, "gif", "high", nil, o); err == nil {
		t.Fatal("EOF accepted")
	}
	o.Capture.StartMs = 1000
	o.Capture.EndMs = 4500
	if _, err := converter.Start(6022, video, "gif", "high", nil, o); err == nil {
		t.Fatal("range beyond duration accepted")
	}
	o.Capture.EndMs = 3500
	if _, err := converter.Start(6023, video, "gif", "high", func(int) { converter.Stop(6023) }, o); err == nil {
		t.Fatal("cancelled capture completed")
	}
	if _, err := converter.Start(6023, video, "gif", "high", nil, o); err != nil {
		t.Fatal("capture retry", err)
	}
	if got, _ := os.ReadFile(video); !bytes.Equal(got, before) {
		t.Fatal("source changed")
	}
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".nyacatch-capture-") {
			t.Fatal("temporary capture leaked")
		}
	}
}

func TestCaptureGIFRatesNativeTimingAndOriginalDimensions(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "24fps.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=960x540:r=24:d=2", "-c:v", "libx264", "-threads", "1", source)
	converter := NewConverter(bin)
	for i, fps := range []int{6, 10, 12, 24, 0} {
		o := &core.ConversionOptions{Version: 1, MaxEdge: 480, Capture: &core.CaptureRange{EndMs: 2000, FPS: fps}}
		if fps == 0 {
			o.MaxEdge = 0
		}
		out, err := converter.Start(int64(6100+i), source, "gif", "high", nil, o)
		if err != nil {
			t.Fatal(fps, err)
		}
		raw := fixtureCommand(t, filepath.Join(filepath.Dir(bin), "ffprobe"+filepath.Ext(bin)), "-v", "error", "-min_delay", "0", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames:format=duration", "-of", "json", out)
		var info struct {
			Streams []struct {
				Width, Height int
				Frames        string `json:"nb_read_frames"`
			}
			Format struct{ Duration string }
		}
		if err := json.Unmarshal(raw, &info); err != nil {
			t.Fatal(err)
		}
		rate := fps
		if rate == 0 {
			rate = 24
		}
		if info.Streams[0].Frames != fmt.Sprint(rate*2) {
			t.Fatal("wrong frame count", fps, string(raw))
		}
		w, h := 480, 270
		if fps == 0 {
			w, h = 960, 540
		}
		if info.Streams[0].Width != w || info.Streams[0].Height != h {
			t.Fatal("wrong original/compact dimensions", string(raw))
		}
	}
	for i, rate := range []string{"30000/1001", "60", "vfr"} {
		file := filepath.Join(dir, fmt.Sprintf("native-%d.mp4", i))
		r := rate
		if r == "vfr" {
			r = "30"
		}
		args := []string{"-v", "error", "-f", "lavfi", "-i", "testsrc2=s=96x64:r=" + r + ":d=2"}
		if rate == "vfr" {
			args = append(args, "-vf", "select='not(eq(mod(n,3),1))'", "-fps_mode", "vfr")
		}
		fixtureCommand(t, bin, append(args, "-c:v", "libx264", "-threads", "1", file)...)
		out, err := converter.Start(int64(6120+i), file, "gif", "high", nil, &core.ConversionOptions{Version: 1, Capture: &core.CaptureRange{EndMs: 2000}})
		if err != nil {
			t.Fatal(rate, err)
		}
		timestamps := func(name string, gif bool) []float64 {
			args := []string{"-v", "error"}
			if gif {
				args = append(args, "-min_delay", "0")
			}
			args = append(args, "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", name)
			raw := fixtureCommand(t, filepath.Join(filepath.Dir(bin), "ffprobe"+filepath.Ext(bin)), args...)
			var info struct {
				Frames []struct {
					Timestamp string `json:"best_effort_timestamp_time"`
				}
			}
			if err := json.Unmarshal(raw, &info); err != nil {
				t.Fatal(err)
			}
			values := []float64{}
			for _, frame := range info.Frames {
				value, err := strconv.ParseFloat(frame.Timestamp, 64)
				if err != nil {
					t.Fatal(err)
				}
				if value < 2 {
					values = append(values, value)
				}
			}
			return values
		}
		before, after := timestamps(file, false), timestamps(out, true)
		if len(before) != len(after) {
			t.Fatalf("%s native frame count changed %d -> %d", rate, len(before), len(after))
		}
		for n := range before {
			if math.Abs(before[n]-after[n]) > .011 {
				t.Fatalf("%s timestamp %d differs: %.4f -> %.4f", rate, n, before[n], after[n])
			}
		}
	}
}
