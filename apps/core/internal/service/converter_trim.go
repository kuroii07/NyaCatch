package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"

	"caorushizi.cn/mediago/internal/core"
)

func (c *Converter) validateTrimSource(ctx context.Context, file, format string, clip *core.TrimRange) error {
	probeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	bin := filepath.Join(filepath.Dir(c.ffmpegBin), "ffprobe"+filepath.Ext(c.ffmpegBin))
	cmd := exec.CommandContext(probeCtx, bin, "-v", "error", "-protocol_whitelist", "file", "-show_entries", "format=duration:stream=codec_type,duration:stream_disposition=attached_pic", "-of", "json", file)
	configureMediaCommand(cmd)
	raw, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("cannot inspect source for trimming: %w", err)
	}
	var info struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
		Streams []struct {
			Type        string `json:"codec_type"`
			Duration    string `json:"duration"`
			Disposition struct {
				Attached int `json:"attached_pic"`
			} `json:"disposition"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(raw, &info); err != nil {
		return fmt.Errorf("invalid source metadata: %w", err)
	}
	seconds, _ := strconv.ParseFloat(info.Format.Duration, 64)
	trackDuration := float64(0)
	hasVideo, hasAudio := false, false
	for _, stream := range info.Streams {
		hasVideo = hasVideo || (stream.Type == "video" && stream.Disposition.Attached == 0)
		hasAudio = hasAudio || stream.Type == "audio"
		if value, err := strconv.ParseFloat(stream.Duration, 64); err == nil && value > trackDuration && !math.IsInf(value, 0) && !math.IsNaN(value) {
			trackDuration = value
		}
	}
	if seconds <= 0 || math.IsNaN(seconds) || math.IsInf(seconds, 0) {
		seconds = trackDuration
	}
	if seconds <= 0 || math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds*1000 > float64(math.MaxInt64/int64(time.Millisecond)) {
		return fmt.Errorf("source duration is unavailable")
	}
	if clip.EndMs > int64(math.Round(seconds*1000)) {
		return fmt.Errorf("trim range exceeds source duration")
	}
	wantAudio := false
	switch format {
	case "mp3", "m4a", "aac", "flac", "wav", "ogg", "opus":
		wantAudio = true
	}
	if (wantAudio && !hasAudio) || (!wantAudio && !hasVideo) {
		return fmt.Errorf("source does not contain the required media track")
	}
	return nil
}
