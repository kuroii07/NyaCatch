package service

import (
	"bytes"
	"context"
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"caorushizi.cn/mediago/internal/core"
)

func TestMergeRealOrderCanvasAudioAndProtection(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	a, b := filepath.Join(dir, "第一段 ' #.mp4"), filepath.Join(dir, "second.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=96x64:r=12:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-c:a", "aac", "-threads", "1", a)
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=32x48:r=24:d=1.5", "-c:v", "libx264", "-threads", "1", b)
	abefore, _ := os.ReadFile(a)
	bbefore, _ := os.ReadFile(b)
	converter := NewConverter(bin)
	for i, format := range []string{"mp4", "mkv"} {
		options := &core.ConversionOptions{Version: 1, Merge: &core.MergeSources{Paths: []string{a, b}, Name: "拼接结果"}}
		existing := filepath.Join(dir, "拼接结果."+format)
		os.WriteFile(existing, []byte("keep"), 0600)
		out, err := converter.Start(int64(5000+i), a, format, "medium", nil, options)
		if err != nil {
			t.Fatal(err)
		}
		if out == existing {
			t.Fatal("overwrote existing file")
		}
		info, err := converter.inspectMergeSource(context.Background(), out)
		if err != nil || info.width != 96 || info.height != 64 || info.audio < 0 || math.Abs(info.duration.Seconds()-2.5) > .15 {
			t.Fatalf("bad merged metadata: %+v %v", info, err)
		}
		frame := fixtureCommand(t, bin, "-v", "error", "-ss", "1.6", "-i", out, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
		if len(frame) != 96*64*3 {
			t.Fatal("bad frame size")
		}
		center := frame[(32*96+48)*3:]
		border := frame[(32*96+10)*3:]
		if center[2] < 180 || center[0] > 40 || border[0] > 30 || border[1] > 30 || border[2] > 30 {
			t.Fatal("order, scale or padding is incorrect")
		}
		pcm := fixtureCommand(t, bin, "-v", "error", "-ss", "1.7", "-i", out, "-t", "0.3", "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1")
		var peak int
		for i := 0; i+1 < len(pcm); i += 2 {
			v := int(int16(binary.LittleEndian.Uint16(pcm[i:])))
			if v < 0 {
				v = -v
			}
			if v > peak {
				peak = v
			}
		}
		if peak > 200 {
			t.Fatalf("silent segment has audio: %d", peak)
		}
		if got, _ := os.ReadFile(existing); string(got) != "keep" {
			t.Fatal("existing output changed")
		}
	}
	wave := filepath.Join(dir, "wave.wav")
	writeTrimWave(t, wave)
	first, second := filepath.Join(dir, "a.wav"), filepath.Join(dir, "b.wav")
	fixtureCommand(t, bin, "-v", "error", "-i", wave, "-t", "1", "-c:a", "pcm_s16le", first)
	fixtureCommand(t, bin, "-v", "error", "-ss", "2", "-i", wave, "-t", "1", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", second)
	options := &core.ConversionOptions{Version: 1, Merge: &core.MergeSources{Paths: []string{second, first}, Name: "wave"}}
	for i, format := range []string{"wav", "mp3", "m4a", "aac", "flac", "ogg", "opus"} {
		out, err := converter.Start(int64(5010+i), second, format, "medium", nil, options)
		if err != nil {
			t.Fatal(format, err)
		}
		pcm := fixtureCommand(t, bin, "-v", "error", "-i", out, "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1")
		for j, want := range []float64{880, 440} {
			crossings := 0
			start := j*16000 + 3200
			end := j*16000 + 11200
			for n := start + 1; n < end; n++ {
				if int16(binary.LittleEndian.Uint16(pcm[(n-1)*2:])) <= 0 && int16(binary.LittleEndian.Uint16(pcm[n*2:])) > 0 {
					crossings++
				}
			}
			if math.Abs(float64(crossings)/.5-want) > 6 {
				t.Fatal(format, "wrong audio order")
			}
		}
	}
	if got, _ := os.ReadFile(a); !bytes.Equal(got, abefore) {
		t.Fatal("source changed")
	}
	if got, _ := os.ReadFile(b); !bytes.Equal(got, bbefore) {
		t.Fatal("source changed")
	}
	options.Merge.Paths = []string{a, first}
	if _, err := converter.Start(5030, a, "mp4", "medium", nil, options); err == nil {
		t.Fatal("mixed video/audio accepted")
	}
	options.Merge.Paths = []string{a, filepath.Join(dir, "missing.mp4")}
	if _, err := converter.Start(5031, a, "mp4", "medium", nil, options); err == nil {
		t.Fatal("missing source accepted")
	}
	options.Merge.Paths = []string{a, b}
	if _, err := converter.Start(5032, a, "mp4", "medium", func(int) { converter.Stop(5032) }, options); err == nil {
		t.Fatal("cancelled job completed")
	}
	if _, err := converter.Start(5032, a, "mp4", "medium", nil, options); err != nil {
		t.Fatal("retry", err)
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".nyacatch-merge-") {
			t.Fatal("temporary files leaked")
		}
	}
}
