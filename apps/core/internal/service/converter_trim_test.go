package service

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"caorushizi.cn/mediago/internal/core"
)

func writeTrimWave(t *testing.T, file string) {
	t.Helper()
	const rate = 16000
	var out bytes.Buffer
	out.WriteString("RIFF")
	binary.Write(&out, binary.LittleEndian, uint32(36+rate*6*2))
	out.WriteString("WAVEfmt ")
	for _, v := range []any{uint32(16), uint16(1), uint16(1), uint32(rate), uint32(rate * 2), uint16(2), uint16(16)} {
		binary.Write(&out, binary.LittleEndian, v)
	}
	out.WriteString("data")
	binary.Write(&out, binary.LittleEndian, uint32(rate*6*2))
	for i := 0; i < rate*6; i++ {
		freq := 440.0
		if i >= rate*2 {
			freq = 880
		}
		if i >= rate*4 {
			freq = 1320
		}
		binary.Write(&out, binary.LittleEndian, int16(16000*math.Sin(2*math.Pi*freq*float64(i)/rate)))
	}
	if err := os.WriteFile(file, out.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
}

func TestTrimRealRangeContentDurationAndProtection(t *testing.T) {
	ffmpeg := os.Getenv("NYACATCH_TEST_FFMPEG")
	if ffmpeg == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	audio := filepath.Join(dir, "source.wav")
	writeTrimWave(t, audio)
	before, _ := os.ReadFile(audio)
	video := filepath.Join(dir, "video.mp4")
	fixtureCommand(t, ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=96x64:rate=10", "-i", audio, "-t", "6", "-c:v", "libx264", "-c:a", "aac", "-threads", "1", video)
	videoBefore, _ := os.ReadFile(video)
	options := &core.ConversionOptions{Version: 1, Trim: &core.TrimRange{StartMs: 2250, EndMs: 3500}}
	existing := filepath.Join(dir, "source-clip-2250-3500.wav")
	os.WriteFile(existing, []byte("keep-existing"), 0600)
	output, err := NewConverter(ffmpeg).Start(3001, audio, "wav", "medium", nil, options)
	if err != nil {
		t.Fatal(err)
	}
	if output == existing || output == audio {
		t.Fatal("unsafe clip filename")
	}
	pcm := fixtureCommand(t, ffmpeg, "-v", "error", "-i", output, "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1")
	if len(pcm) != 16000*2*1250/1000 {
		t.Fatalf("wrong audio range length: %d", len(pcm))
	}
	crossings := 0
	for i := 2; i < len(pcm); i += 2 {
		a := int16(binary.LittleEndian.Uint16(pcm[i-2:]))
		b := int16(binary.LittleEndian.Uint16(pcm[i:]))
		if a <= 0 && b > 0 {
			crossings++
		}
	}
	freq := float64(crossings) / 1.25
	if math.Abs(freq-880) > 3 {
		t.Fatalf("trim used wrong source segment: %.2f Hz", freq)
	}
	clip, err := NewConverter(ffmpeg).Start(3002, video, "mp4", "medium", nil, options)
	if err != nil {
		t.Fatal(err)
	}
	probe := filepath.Join(filepath.Dir(ffmpeg), "ffprobe"+filepath.Ext(ffmpeg))
	var info struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
		Streams []struct {
			Type string `json:"codec_type"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(fixtureCommand(t, probe, "-v", "error", "-show_format", "-show_streams", "-of", "json", clip), &info); err != nil {
		t.Fatal(err)
	}
	seconds, _ := strconv.ParseFloat(info.Format.Duration, 64)
	if math.Abs(seconds-1.25) > 0.15 {
		t.Fatalf("wrong video clip duration: %.3f", seconds)
	}
	hasVideo, hasAudio := false, false
	for _, s := range info.Streams {
		hasVideo = hasVideo || s.Type == "video"
		hasAudio = hasAudio || s.Type == "audio"
	}
	if !hasVideo || !hasAudio {
		t.Fatal("clip lost media tracks")
	}
	if got, _ := os.ReadFile(audio); !bytes.Equal(got, before) {
		t.Fatal("source audio changed")
	}
	if got, _ := os.ReadFile(video); !bytes.Equal(got, videoBefore) {
		t.Fatal("source video changed")
	}
	if got, _ := os.ReadFile(existing); string(got) != "keep-existing" {
		t.Fatal("existing output changed")
	}
	// A custom clip name is persisted in options and collision protection also
	// applies when that name deliberately matches the source file.
	named := &core.ConversionOptions{Version: 1, Trim: &core.TrimRange{EndMs: 1000, Name: "source"}}
	namedOutput, err := NewConverter(ffmpeg).Start(3005, audio, "wav", "medium", nil, named)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(namedOutput) != "source (1).wav" {
		t.Fatalf("unexpected named output: %s", namedOutput)
	}
	if got, _ := os.ReadFile(audio); !bytes.Equal(got, before) {
		t.Fatal("named clip changed original")
	}
	badDir := filepath.Join(dir, "invalid-output")
	bad := &core.ConversionOptions{Version: 1, OutputDir: badDir, Trim: &core.TrimRange{EndMs: 7000}}
	if _, err := NewConverter(ffmpeg).Start(3003, audio, "wav", "medium", nil, bad); err == nil {
		t.Fatal("range beyond source accepted")
	}
	if _, err := os.Stat(badDir); !os.IsNotExist(err) {
		t.Fatal("invalid range created an output directory")
	}
	bad.Trim.EndMs = 1000
	if _, err := NewConverter(ffmpeg).Start(3004, audio, "mp4", "medium", nil, bad); err == nil {
		t.Fatal("audio-only source accepted for video output")
	}
	if _, err := os.Stat(badDir); !os.IsNotExist(err) {
		t.Fatal("missing track created output directory")
	}
}
