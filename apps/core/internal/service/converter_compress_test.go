package service

import (
	"bytes"
	"caorushizi.cn/mediago/internal/core"
	"context"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestCompressionRealEncodersTrialCopyAndProtection(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	file := filepath.Join(dir, "源 ' #.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=160x96:r=24:d=3", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3", "-c:v", "libx264", "-crf", "4", "-c:a", "aac", "-threads", "1", file)
	before, _ := os.ReadFile(file)
	converter := NewConverter(bin)
	id := int64(7000)
	for _, codec := range []string{"h264", "hevc"} {
		for _, format := range []string{"mp4", "mkv"} {
			for _, audio := range []string{"aac", "copy"} {
				id++
				o := &core.ConversionOptions{Version: 1, Compress: &core.CompressionOptions{Codec: codec, CRF: 24, Preset: "fast", Audio: audio, Bitrate: 192}}
				if audio == "copy" {
					o.Compress.Bitrate = 0
				}
				if _, err := converter.prepareCompression(file, format, o); err != nil {
					t.Fatal(err)
				}
				out, err := converter.Start(id, file, format, "medium", nil, o)
				if err != nil {
					t.Fatal(codec, format, audio, err)
				}
				info, err := converter.inspectCompression(context.Background(), out)
				if err != nil || info.videoCodec != codec || info.audioCodec != "aac" || info.width != 160 || info.height != 96 {
					t.Fatalf("bad result %+v %v", info, err)
				}
				probe := filepath.Join(filepath.Dir(bin), "ffprobe"+filepath.Ext(bin))
				raw := fixtureCommand(t, probe, "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=nb_read_frames,codec_tag_string", "-of", "json", out)
				var data struct {
					Streams []struct {
						Frames string `json:"nb_read_frames"`
						Tag    string `json:"codec_tag_string"`
					}
				}
				if err := json.Unmarshal(raw, &data); err != nil {
					t.Fatal(err)
				}
				if data.Streams[0].Frames != "72" {
					t.Fatal("native frames were changed", string(raw))
				}
				if codec == "hevc" && format == "mp4" && data.Streams[0].Tag != "hvc1" {
					t.Fatal("HEVC MP4 tag")
				}
				if audio == "copy" {
					a := fixtureCommand(t, bin, "-v", "error", "-i", file, "-map", "0:a:0", "-c", "copy", "-f", "adts", "pipe:1")
					b := fixtureCommand(t, bin, "-v", "error", "-i", out, "-map", "0:a:0", "-c", "copy", "-f", "adts", "pipe:1")
					if !bytes.Equal(a, b) {
						t.Fatal("copied audio payload changed")
					}
				}
			}
		}
	}
	o := &core.ConversionOptions{Version: 1, MaxEdge: 80, Compress: &core.CompressionOptions{Codec: "h264", CRF: 23, Preset: "medium", Audio: "aac", Bitrate: 128, FPS: 30, Trial: &core.TrimRange{StartMs: 1000, EndMs: 2000}}}
	out, err := converter.Start(7050, file, "mp4", "medium", nil, o)
	if err != nil {
		t.Fatal(err)
	}
	info, err := converter.inspectCompression(context.Background(), out)
	if err != nil || info.width != 80 || info.height != 48 {
		t.Fatal("trial scale", info, err)
	}
	raw := fixtureCommand(t, filepath.Join(filepath.Dir(bin), "ffprobe"+filepath.Ext(bin)), "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=nb_read_frames,duration", "-of", "json", out)
	if !strings.Contains(string(raw), `"30"`) {
		t.Fatal("trial FPS", string(raw))
	}
	saved, _ := os.ReadFile(out)
	again, err := converter.Start(7051, file, "mp4", "medium", nil, o)
	if err != nil || again == out {
		t.Fatal("same-name protection", err)
	}
	if got, _ := os.ReadFile(out); !bytes.Equal(got, saved) {
		t.Fatal("existing output changed")
	}
	if _, err := converter.Start(7052, file, "mp4", "medium", func(int) { converter.Stop(7052) }, o); err == nil {
		t.Fatal("cancelled compression completed")
	}
	if _, err := converter.Start(7052, file, "mp4", "medium", nil, o); err != nil {
		t.Fatal("retry", err)
	}
	o.MaxEdge = 1920
	if _, err := converter.Start(7053, file, "mp4", "medium", nil, o); err == nil {
		t.Fatal("upscale accepted")
	}
	o.MaxEdge = 0
	o.Compress.Trial.EndMs = 4000
	if _, err := converter.Start(7054, file, "mp4", "medium", nil, o); err == nil {
		t.Fatal("out-of-range trial")
	}
	if got, _ := os.ReadFile(file); !bytes.Equal(before, got) {
		t.Fatal("source changed")
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".nyacatch-compress-") {
			t.Fatal("temporary file leaked")
		}
	}
}
func TestCompressionNoAudioAndSourceGuards(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	video := filepath.Join(dir, "silent.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=96x64:r=12:d=1", "-c:v", "libx264", "-threads", "1", video)
	c := NewConverter(bin)
	o := &core.ConversionOptions{Version: 1, Compress: &core.CompressionOptions{Codec: "hevc", CRF: 28, Preset: "fast", Audio: "aac", Bitrate: 192}}
	out, err := c.Start(7100, video, "mkv", "medium", nil, o)
	if err != nil {
		t.Fatal(err)
	}
	info, err := c.inspectCompression(context.Background(), out)
	if err != nil || info.audio >= 0 {
		t.Fatal("silent video gained audio", err)
	}
	if _, err = c.prepareCompression(video, "mp4", o); err != nil {
		t.Fatal(err)
	}
	o.Compress.SourceBytes++
	if _, err = c.Start(7101, video, "mp4", "medium", nil, o); err == nil {
		t.Fatal("changed source accepted")
	}
	hdr := filepath.Join(dir, "hdr.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=64x64:r=10:d=1", "-color_trc", "smpte2084", "-c:v", "libx264", "-threads", "1", hdr)
	o.Compress.SourceBytes = 0
	o.Compress.SourceModifiedMs = 0
	if _, err = c.Start(7102, hdr, "mp4", "medium", nil, o); err == nil {
		t.Fatal("HDR accepted")
	}
	audio := filepath.Join(dir, "audio.wav")
	writeTrimWave(t, audio)
	if _, err = c.Start(7103, audio, "mp4", "medium", nil, o); err == nil {
		t.Fatal("audio accepted as video")
	}
	ten := filepath.Join(dir, "10bit.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=64x64:r=10:d=1", "-pix_fmt", "yuv420p10le", "-c:v", "libx265", "-x265-params", "pools=2:frame-threads=1:log-level=error", "-threads", "2", ten)
	if _, err = c.Start(7104, ten, "mp4", "medium", nil, o); err == nil {
		t.Fatal("10-bit SDR accepted")
	}
}

func TestCompressionPreservesNativeVFRFramesAndTiming(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "vfr.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=96x64:r=30:d=2", "-vf", "select='not(eq(mod(n,3),1))'", "-fps_mode", "vfr", "-c:v", "libx264", "-threads", "1", source)
	times := func(file string) []float64 {
		raw := fixtureCommand(t, filepath.Join(filepath.Dir(bin), "ffprobe"+filepath.Ext(bin)), "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", file)
		var data struct {
			Frames []struct {
				Time string `json:"best_effort_timestamp_time"`
			}
		}
		if err := json.Unmarshal(raw, &data); err != nil {
			t.Fatal(err)
		}
		values := []float64{}
		for _, f := range data.Frames {
			n, err := strconv.ParseFloat(f.Time, 64)
			if err != nil {
				t.Fatal(err)
			}
			values = append(values, n)
		}
		return values
	}
	before := times(source)
	for i, codec := range []string{"h264", "hevc"} {
		out, err := NewConverter(bin).Start(int64(7150+i), source, "mp4", "medium", nil, &core.ConversionOptions{Version: 1, Compress: &core.CompressionOptions{Codec: codec, CRF: 23, Preset: "fast", Audio: "aac", Bitrate: 192}})
		if err != nil {
			t.Fatal(err)
		}
		after := times(out)
		if len(after) != len(before) {
			t.Fatalf("VFR frame count %d -> %d", len(before), len(after))
		}
		for n := range before {
			if math.Abs((after[n]-after[0])-(before[n]-before[0])) > .002 {
				t.Fatal("VFR timing changed", codec, n, before[n], after[n])
			}
		}
	}
}
