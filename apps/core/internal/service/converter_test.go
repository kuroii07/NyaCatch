package service

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"caorushizi.cn/mediago/internal/api/sse"
	"caorushizi.cn/mediago/internal/db"
	"caorushizi.cn/mediago/internal/db/repo"
	"caorushizi.cn/mediago/internal/logger"
	"go.uber.org/zap"
)

func TestConverterProtectsInputsAndExistingOutputs(t *testing.T) {
	ffmpeg := os.Getenv("NYACATCH_TEST_FFMPEG")
	if ffmpeg == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	input := filepath.Join(dir, "源图片.png")
	if out, err := exec.Command(ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=red:s=32x32", "-frames:v", "1", "-threads", "1", input).CombinedOutput(); err != nil {
		t.Fatalf("make fixture: %v: %s", err, out)
	}
	original, _ := os.ReadFile(input)
	existing := filepath.Join(dir, "源图片.jpg")
	if err := os.WriteFile(existing, []byte("keep me"), 0600); err != nil {
		t.Fatal(err)
	}
	c := NewConverter(ffmpeg)
	output, err := c.Start(1, input, "jpg", "medium", nil)
	if err != nil {
		t.Fatal(err)
	}
	if output == existing || output == input {
		t.Fatalf("unsafe output path: %s", output)
	}
	if got, _ := os.ReadFile(existing); string(got) != "keep me" {
		t.Fatal("existing output changed")
	}
	if got, _ := os.ReadFile(input); !bytes.Equal(got, original) {
		t.Fatal("original changed")
	}
	if stat, err := os.Stat(output); err != nil || stat.Size() == 0 {
		t.Fatalf("output missing or empty: %v", err)
	}
	same, err := c.Start(2, input, "png", "high", nil)
	if err != nil {
		t.Fatal(err)
	}
	if same == input {
		t.Fatal("same-format conversion overwrote input")
	}
	if got, _ := os.ReadFile(input); !bytes.Equal(got, original) {
		t.Fatal("same-format conversion changed input")
	}
}

func TestConverterFormatsProduceRealTracks(t *testing.T) {
	ffmpeg := os.Getenv("NYACATCH_TEST_FFMPEG")
	if ffmpeg == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	input := filepath.Join(dir, "fixture.mp4")
	args := []string{"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=64x64:rate=5", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-threads", "1", input}
	if out, err := exec.Command(ffmpeg, args...).CombinedOutput(); err != nil {
		t.Fatalf("make video fixture: %v: %s", err, out)
	}
	probe := filepath.Join(filepath.Dir(ffmpeg), "ffprobe"+filepath.Ext(ffmpeg))
	for i, format := range []string{"mp4", "mkv", "mov", "webm", "flv", "ts", "avi", "m4v", "mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "png", "jpg", "webp", "bmp"} {
		t.Run(format, func(t *testing.T) {
			output, err := NewConverter(ffmpeg).Start(int64(i+1), input, format, "medium", nil)
			if err != nil {
				t.Fatal(err)
			}
			raw, err := exec.Command(probe, "-v", "error", "-show_streams", "-show_format", "-of", "json", output).Output()
			if err != nil {
				t.Fatalf("probe: %v", err)
			}
			var result struct {
				Streams []struct {
					CodecType string `json:"codec_type"`
					CodecName string `json:"codec_name"`
				} `json:"streams"`
				Format struct {
					Name string `json:"format_name"`
				} `json:"format"`
			}
			if err := json.Unmarshal(raw, &result); err != nil {
				t.Fatal(err)
			}
			hasVideo, hasAudio := false, false
			for _, s := range result.Streams {
				hasVideo = hasVideo || s.CodecType == "video"
				hasAudio = hasAudio || s.CodecType == "audio"
			}
			isAudio := format == "mp3" || format == "m4a" || format == "aac" || format == "flac" || format == "wav" || format == "ogg" || format == "opus"
			isImage := format == "png" || format == "jpg" || format == "webp" || format == "bmp"
			if isAudio && (!hasAudio || hasVideo) {
				t.Fatalf("invalid audio tracks: %+v", result.Streams)
			}
			if isImage && (!hasVideo || hasAudio) {
				t.Fatalf("invalid image tracks: %+v", result.Streams)
			}
			if !isAudio && !isImage && (!hasVideo || !hasAudio) {
				t.Fatalf("invalid video tracks: %+v", result.Streams)
			}
			if expected := map[string]string{"flv": "flv", "ts": "mpegts", "avi": "avi", "m4v": "mov,mp4,m4a,3gp,3g2,mj2"}[format]; expected != "" && result.Format.Name != expected {
				t.Fatalf("wrong container for %s: %s", format, result.Format.Name)
			}
			for _, stream := range result.Streams {
				if stream.CodecType == "video" && (format == "flv" || format == "ts" || format == "m4v") && stream.CodecName != "h264" {
					t.Fatalf("expected H.264 video: %+v", stream)
				}
				if format == "avi" && ((stream.CodecType == "video" && stream.CodecName != "mpeg4") || (stream.CodecType == "audio" && stream.CodecName != "mp3")) {
					t.Fatalf("expected MPEG-4/MP3 AVI: %+v", stream)
				}
			}
		})
	}
}

func TestConverterCancelBeforeWorkerStarts(t *testing.T) {
	c := NewConverter("unused")
	ctx, err := c.reserve(1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := c.reserve(1); err == nil {
		t.Fatal("duplicate task accepted")
	}
	if !c.Stop(1) {
		t.Fatal("registered worker could not be cancelled")
	}
	select {
	case <-ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("cancel did not reach worker")
	}
	c.release(1)
}

func TestConverterFailureLeavesExistingFilesUntouched(t *testing.T) {
	ffmpeg := os.Getenv("NYACATCH_TEST_FFMPEG")
	if ffmpeg == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	input := filepath.Join(dir, "bad.mp4")
	existing := filepath.Join(dir, "bad.mp3")
	if err := os.WriteFile(input, []byte("invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(existing, []byte("existing"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewConverter(ffmpeg).Start(1, input, "mp3", "medium", nil); err == nil {
		t.Fatal("invalid input succeeded")
	}
	if got, _ := os.ReadFile(existing); string(got) != "existing" {
		t.Fatal("existing file changed")
	}
	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Fatalf("temporary output remained: %v", files)
	}
}

func TestAudioCannotProducePretendVideo(t *testing.T) {
	ffmpeg := os.Getenv("NYACATCH_TEST_FFMPEG")
	if ffmpeg == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	input := filepath.Join(dir, "audio.wav")
	if out, err := exec.Command(ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.1", input).CombinedOutput(); err != nil {
		t.Fatalf("fixture: %v: %s", err, out)
	}
	if _, err := NewConverter(ffmpeg).Start(1, input, "mp4", "medium", nil); err == nil {
		t.Fatal("audio-only source was accepted as video")
	}
	if _, err := os.Stat(filepath.Join(dir, "audio.mp4")); !os.IsNotExist(err) {
		t.Fatal("invalid video output was retained")
	}
}

func TestConversionServiceCancellationWhileQueued(t *testing.T) {
	database, err := db.New(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	input := filepath.Join(t.TempDir(), "input.wav")
	if err := os.WriteFile(input, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	oldSugar := logger.Sugar
	logger.Sugar = zap.NewNop().Sugar()
	defer func() { logger.Sugar = oldSugar }()
	converter := NewConverter("unused")
	converter.slots <- struct{}{}
	converter.slots <- struct{}{}
	svc := NewConversionService(repo.NewConversionRepository(database), converter, sse.New())
	task, err := svc.AddConversion(&AddConversionInput{Path: input, OutputFormat: "mp3", Quality: "medium"})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.StartConversion(task.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.StartConversion(task.ID); err == nil {
		t.Fatal("duplicate start accepted")
	}
	if err := svc.DeleteConversion(task.ID); err == nil {
		t.Fatal("deleted running task")
	}
	if err := svc.StopConversion(task.ID); err != nil {
		t.Fatal(err)
	}
	waitFailed := func() {
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			current, err := svc.FindByIDOrFail(task.ID)
			if err != nil {
				t.Fatal(err)
			}
			if current.Status == "failed" {
				if current.OutputPath != "" {
					t.Fatal("cancelled task has output")
				}
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Fatal("cancelled task did not become retryable")
	}
	waitFailed()
	if err := svc.StartConversion(task.ID); err != nil {
		t.Fatalf("cannot retry: %v", err)
	}
	if err := svc.StopConversion(task.ID); err != nil {
		t.Fatal(err)
	}
	waitFailed()
}

func TestConverterRejectsUnsupportedFormatsAndNonFiles(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "file.txt")
	if err := os.WriteFile(input, []byte("not media"), 0600); err != nil {
		t.Fatal(err)
	}
	c := NewConverter("not-an-ffmpeg")
	for _, tc := range []struct{ input, format string }{{input, "../bad"}, {input, "exe"}, {dir, "mp3"}} {
		if _, err := c.Start(10, tc.input, tc.format, "medium", nil); err == nil {
			t.Fatalf("accepted invalid input %q format %q", tc.input, tc.format)
		}
	}
}
