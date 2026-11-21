package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"caorushizi.cn/mediago/internal/core"
)

type audioSource struct {
	Codec    string `json:"codec_name"`
	Rate     string `json:"sample_rate"`
	Channels int    `json:"channels"`
	Duration string `json:"duration"`
	Tags     struct {
		Duration string `json:"DURATION"`
	} `json:"tags"`
	seconds       float64
	exactDuration bool
}

// Copy only to containers known to preserve this codec. Never silently re-encode.
func audioCopyExtension(codec string) string {
	switch codec {
	case "aac", "alac":
		return "m4a"
	case "mp3", "flac", "opus", "ac3", "eac3", "dts", "mp2":
		return codec
	case "vorbis":
		return "ogg"
	case "pcm_u8", "pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le", "pcm_f64le":
		return "wav"
	default:
		return ""
	}
}

func (c *Converter) inspectAudioSource(ctx context.Context, file string) (audioSource, error) {
	var result audioSource
	probeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	probe := filepath.Join(filepath.Dir(c.ffmpegBin), "ffprobe"+filepath.Ext(c.ffmpegBin))
	cmd := exec.CommandContext(probeCtx, probe, "-v", "error", "-protocol_whitelist", "file", "-select_streams", "a:0", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels,duration:stream_tags=DURATION", "-of", "json", file)
	configureMediaCommand(cmd)
	raw, err := cmd.Output()
	if err != nil {
		return result, fmt.Errorf("cannot inspect source audio: %w", err)
	}
	var data struct {
		Streams []audioSource `json:"streams"`
		Format  struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	if err := json.Unmarshal(raw, &data); err != nil || len(data.Streams) == 0 {
		return result, fmt.Errorf("source has no readable audio track")
	}
	result = data.Streams[0]
	result.seconds, _ = strconv.ParseFloat(result.Duration, 64)
	if result.seconds <= 0 || math.IsNaN(result.seconds) || math.IsInf(result.seconds, 0) {
		var hours, minutes int
		var seconds float64
		if _, err := fmt.Sscanf(result.Tags.Duration, "%d:%d:%f", &hours, &minutes, &seconds); err == nil && hours >= 0 && minutes >= 0 && minutes < 60 && seconds >= 0 && seconds < 60 {
			result.seconds = float64(hours)*3600 + float64(minutes)*60 + seconds
		}
	}
	result.exactDuration = result.seconds > 0 && !math.IsNaN(result.seconds) && !math.IsInf(result.seconds, 0)
	if result.seconds <= 0 || math.IsNaN(result.seconds) || math.IsInf(result.seconds, 0) {
		result.seconds, _ = strconv.ParseFloat(data.Format.Duration, 64)
	}
	rate, _ := strconv.Atoi(result.Rate)
	if result.Codec == "" || result.Channels <= 0 || rate <= 0 || result.seconds <= 0 || math.IsNaN(result.seconds) || math.IsInf(result.seconds, 0) || result.seconds > float64(math.MaxInt64/int64(time.Second)) {
		return result, fmt.Errorf("source audio metadata is unavailable")
	}
	return result, nil
}

func (c *Converter) extractOriginalAudio(ctx context.Context, input string, progress ProgressCallback, options *core.ConversionOptions) (string, error) {
	source, err := c.inspectAudioSource(ctx, input)
	if err != nil {
		return "", err
	}
	extension := audioCopyExtension(source.Codec)
	if extension == "" {
		return "", fmt.Errorf("original audio extraction does not support %s; select a conversion format", source.Codec)
	}
	dir := filepath.Dir(input)
	if options != nil && options.OutputDir != "" {
		dir = options.OutputDir
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	file, err := os.CreateTemp(dir, ".nyacatch-audio-*."+extension)
	if err != nil {
		return "", err
	}
	temp := file.Name()
	if err := file.Close(); err != nil {
		_ = os.Remove(temp)
		return "", err
	}
	defer os.Remove(temp)
	args := []string{"-hide_banner", "-nostdin", "-y", "-protocol_whitelist", "file", "-i", input, "-map", "0:a:0", "-vn", "-sn", "-dn", "-c:a", "copy", "-map_metadata", "-1"}
	if extension == "m4a" {
		args = append(args, "-movflags", "+faststart")
	}
	args = append(args, temp)
	if err := c.execute(ctx, args, time.Duration(source.seconds*float64(time.Second)), progress); err != nil {
		return "", err
	}
	actual, err := c.inspectAudioSource(ctx, temp)
	if err != nil {
		return "", err
	}
	// Container duration may describe a longer video or another audio track.
	// Compare lengths only when the source provides this track's own duration.
	if actual.Codec != source.Codec || actual.Rate != source.Rate || actual.Channels != source.Channels || source.exactDuration && math.Abs(actual.seconds-source.seconds) > math.Max(.25, source.seconds*.02) {
		return "", fmt.Errorf("extracted audio failed codec, duration or track validation")
	}
	base := strings.TrimSuffix(filepath.Base(input), filepath.Ext(input)) + "-audio"
	return copyConversionOutput(ctx, temp, dir, base, extension)
}
