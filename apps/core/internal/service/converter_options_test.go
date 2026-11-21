package service

import (
	"bytes"
	"caorushizi.cn/mediago/internal/core"
	"caorushizi.cn/mediago/internal/db"
	"caorushizi.cn/mediago/internal/db/repo"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestConversionOptionArguments(t *testing.T) {
	odd := strings.Join(buildFFmpegArgs("input", "output", "mp4", "medium", &core.ConversionOptions{Version: 1, MaxEdge: 33}), " ")
	if !strings.Contains(odd, "min(iw,32)") {
		t.Fatal("codec padding can exceed the requested edge limit")
	}
	original := buildFFmpegArgs("input", "output", "mp4", "medium")
	withNil := buildFFmpegArgs("input", "output", "mp4", "medium", nil)
	if strings.Join(original, "\n") != strings.Join(withNil, "\n") {
		t.Fatal("nil options changed legacy encoding")
	}
	for _, format := range []string{"mp4", "mkv", "mov", "webm", "flv", "ts", "avi", "m4v", "png", "jpg", "webp", "bmp"} {
		args := buildFFmpegArgs("input", "output", format, "medium", &core.ConversionOptions{Version: 1, MaxEdge: 512})
		joined := strings.Join(args, " ")
		if strings.Count(joined, "-vf ") != 1 || !strings.Contains(joined, "min(iw,512)") || !strings.Contains(joined, "force_original_aspect_ratio=decrease") {
			t.Fatalf("incorrect scale args: %s", joined)
		}
	}
	for _, format := range []string{"mp3", "aac", "m4a", "ogg", "opus"} {
		args := buildFFmpegArgs("input", "output", format, "high", &core.ConversionOptions{Version: 1, AudioBitrate: 128})
		joined := strings.Join(args, " ")
		if !strings.Contains(joined, "-b:a 128k") || strings.Contains(joined, "-q:a") {
			t.Fatalf("bitrate ignored: %s", joined)
		}
	}
}
func fixtureCommand(t *testing.T, bin string, args ...string) []byte {
	t.Helper()
	cmd := exec.CommandContext(context.Background(), bin, args...)
	configureMediaCommand(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("fixture command failed: %v %s", err, out)
	}
	return out
}
func TestAdvancedConverterRealDimensionsBitrateAndDirectory(t *testing.T) {
	ffmpeg := os.Getenv("NYACATCH_TEST_FFMPEG09")
	if ffmpeg == "" {
		t.Skip("NYACATCH_TEST_FFMPEG09 not set")
	}
	dir := t.TempDir()
	input := filepath.Join(dir, "fixture.mp4")
	fixtureCommand(t, ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=96x64:rate=5", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-threads", "1", input)
	before, _ := os.ReadFile(input)
	outputDir := filepath.Join(dir, "custom-中文")
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		t.Fatal(err)
	}
	existing := filepath.Join(outputDir, "fixture.mp4")
	os.WriteFile(existing, []byte("keep-existing"), 0600)
	conv := NewConverter(ffmpeg)
	probe := filepath.Join(filepath.Dir(ffmpeg), "ffprobe"+filepath.Ext(ffmpeg))
	type stream struct {
		CodecType string `json:"codec_type"`
		Width     int    `json:"width"`
		Height    int    `json:"height"`
		Bitrate   string `json:"bit_rate"`
	}
	inspect := func(file string) []stream {
		var result struct {
			Streams []stream `json:"streams"`
		}
		raw := fixtureCommand(t, probe, "-v", "error", "-show_streams", "-of", "json", file)
		if err := json.Unmarshal(raw, &result); err != nil {
			t.Fatal(err)
		}
		return result.Streams
	}
	resized, err := conv.Start(101, input, "mp4", "medium", nil, &core.ConversionOptions{Version: 1, OutputDir: outputDir, MaxEdge: 32})
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Dir(resized) != outputDir || resized == existing {
		t.Fatalf("unsafe output: %s", resized)
	}
	tracks := inspect(resized)
	if tracks[0].Width != 32 || tracks[0].Height != 22 {
		t.Fatalf("unexpected video sizing: %+v", tracks)
	}
	kept, err := conv.Start(102, input, "mp4", "medium", nil, &core.ConversionOptions{Version: 1, OutputDir: outputDir, MaxEdge: 512})
	if err != nil {
		t.Fatal(err)
	}
	tracks = inspect(kept)
	if tracks[0].Width != 96 || tracks[0].Height != 64 {
		t.Fatal("small video was enlarged")
	}
	portrait := filepath.Join(dir, "portrait.mp4")
	fixtureCommand(t, ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=64x96:rate=5", "-t", "1", "-c:v", "libx264", "-threads", "1", portrait)
	vertical, err := conv.Start(103, portrait, "mp4", "medium", nil, &core.ConversionOptions{Version: 1, OutputDir: outputDir, MaxEdge: 32})
	if err != nil {
		t.Fatal(err)
	}
	tracks = inspect(vertical)
	if tracks[0].Width != 22 || tracks[0].Height != 32 {
		t.Fatalf("portrait was cropped or distorted: %+v", tracks)
	}
	image := filepath.Join(dir, "image.png")
	fixtureCommand(t, ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=red:size=96x64", "-frames:v", "1", "-threads", "1", image)
	scaled, err := conv.Start(104, image, "png", "medium", nil, &core.ConversionOptions{Version: 1, OutputDir: outputDir, MaxEdge: 32})
	if err != nil {
		t.Fatal(err)
	}
	tracks = inspect(scaled)
	if tracks[0].Width != 32 || tracks[0].Height != 21 {
		t.Fatalf("image sizing was padded or ignored: %+v", tracks)
	}
	for _, rate := range []int{64, 192} {
		audio, err := conv.Start(int64(200+rate), input, "mp3", "high", nil, &core.ConversionOptions{Version: 1, OutputDir: outputDir, AudioBitrate: rate})
		if err != nil {
			t.Fatal(err)
		}
		tracks = inspect(audio)
		if len(tracks) != 1 || tracks[0].CodecType != "audio" || tracks[0].Bitrate != map[int]string{64: "64000", 192: "192000"}[rate] {
			t.Fatalf("bitrate not applied: %+v", tracks)
		}
	}
	if data, _ := os.ReadFile(input); !bytes.Equal(data, before) {
		t.Fatal("input changed")
	}
	if data, _ := os.ReadFile(existing); string(data) != "keep-existing" {
		t.Fatal("existing output changed")
	}
}
func TestConversionOptionsPersistAndLegacySchemaUpgrade(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "state.db")
	database, err := db.New(file)
	if err != nil {
		t.Fatal(err)
	}
	if err = database.DB.Migrator().DropColumn(&db.Conversion{}, "options"); err != nil {
		t.Fatal(err)
	}
	if err = database.DB.Exec("INSERT INTO conversion (name,path,status,outputFormat,quality,progress) VALUES (?,?,?,?,?,?)", "old", "input", "failed", "mp4", "low", 0).Error; err != nil {
		t.Fatal(err)
	}
	database.Close()
	database, err = db.New(file)
	if err != nil {
		t.Fatal(err)
	}
	repository := repo.NewConversionRepository(database)
	old, err := repository.FindByIDOrFail(1)
	if err != nil || old.Options != nil || old.Status != "failed" || old.Quality != "low" {
		t.Fatalf("legacy record changed: %+v %v", old, err)
	}
	input := filepath.Join(dir, "input.mp4")
	os.WriteFile(input, []byte("not executed"), 0600)
	options := &core.ConversionOptions{Version: 1, OutputDir: filepath.Join(dir, "not-created"), MaxEdge: 512}
	service := NewConversionService(repository, nil, nil)
	created, err := service.AddConversion(&AddConversionInput{Path: input, OutputFormat: "mp4", Quality: "medium", Options: options})
	if err != nil {
		t.Fatal(err)
	}
	options.MaxEdge = 1024
	if _, err = os.Stat(options.OutputDir); !os.IsNotExist(err) {
		t.Fatal("queue creation wrote output directory")
	}
	database.Close()
	database, err = db.New(file)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	saved, err := repo.NewConversionRepository(database).FindByIDOrFail(created.ID)
	if err != nil || saved.Options == nil || saved.Options.MaxEdge != 512 || saved.Options.OutputDir != options.OutputDir {
		t.Fatalf("task options not persisted: %+v %v", saved, err)
	}
}
