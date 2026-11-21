package service

import (
	"caorushizi.cn/mediago/internal/core"
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func compressionSourceAllowed(media mergeMedia, format string, settings *core.ConversionOptions) error {
	if media.video < 0 || media.width < 2 || media.height < 2 || media.width > 8192 || media.height > 8192 {
		return fmt.Errorf("compression requires a valid local video")
	}
	highDepth := media.bitDepth > 8
	for _, suffix := range []string{"p9", "10", "12", "14", "16", "rgb48", "bgr48", "f32", "f64"} {
		highDepth = highDepth || strings.Contains(media.pixelFormat, suffix)
	}
	if media.transfer == "smpte2084" || media.transfer == "arib-std-b67" || highDepth {
		return fmt.Errorf("HDR and high-bit-depth video are not supported by this compression version; use 8-bit SDR video")
	}
	if settings.MaxEdge > int(math.Max(float64(media.width), float64(media.height))) {
		return fmt.Errorf("compression cannot upscale the source")
	}
	o := settings.Compress
	if media.audio >= 0 && o.Audio == "copy" && format == "mp4" && media.audioCodec != "aac" && media.audioCodec != "mp3" && media.audioCodec != "alac" {
		return fmt.Errorf("this audio codec cannot be copied into MP4; choose AAC or MKV")
	}
	if o.Trial != nil && o.Trial.EndMs > int64(math.Round(media.duration.Seconds()*1000)) {
		return fmt.Errorf("trial exceeds the source duration")
	}
	if o.TargetBytes > 0 {
		audioRate := 0
		if media.audio >= 0 {
			audioRate = o.Bitrate
		}
		if _, err := core.CompressionTargetBitrate(o.TargetBytes, int64(math.Round(media.duration.Seconds()*1000)), audioRate); err != nil {
			return err
		}
	}
	return nil
}

func (c *Converter) inspectCompression(ctx context.Context, input string) (mergeMedia, error) {
	source, err := c.inspectMergeSource(ctx, input)
	if err == nil && source.videoDuration > 0 {
		source.duration = source.videoDuration
	}
	return source, err
}

func (c *Converter) prepareCompression(input, format string, settings *core.ConversionOptions) (mergeMedia, error) {
	source, err := c.inspectCompression(context.Background(), input)
	if err != nil {
		return source, err
	}
	if err = compressionSourceAllowed(source, format, settings); err != nil {
		return source, err
	}
	if err = c.checkCompressionEncoder(settings.Compress); err != nil {
		return source, err
	}
	info, err := os.Stat(input)
	if err != nil {
		return source, err
	}
	// Execution owns these facts; client metadata is never used for size comparisons.
	settings.Compress.SourceBytes = info.Size()
	settings.Compress.SourceModifiedMs = info.ModTime().UnixMilli()
	settings.Compress.DurationMs = int64(math.Round(source.duration.Seconds() * 1000))
	if sub := settings.Compress.Subtitle; sub != nil {
		loaded, err := loadCompressionSubtitle(sub.Path)
		if err != nil {
			return source, err
		}
		if sub.SourceHash != "" && sub.SourceHash != loaded.Info.Hash {
			return source, fmt.Errorf("subtitle has changed; select it again")
		}
		sub.SourceHash = loaded.Info.Hash
	}
	return source, nil
}

func (c *Converter) runCompression(ctx context.Context, input, format string, progress ProgressCallback, settings *core.ConversionOptions) (string, error) {
	resolved, err := filepath.Abs(input)
	if err != nil {
		return "", err
	}
	input = resolved
	source, err := c.inspectCompression(ctx, input)
	if err != nil {
		return "", err
	}
	if err = compressionSourceAllowed(source, format, settings); err != nil {
		return "", err
	}
	info, err := os.Stat(input)
	if err != nil {
		return "", err
	}
	o := settings.Compress
	if (o.SourceBytes > 0 && o.SourceBytes != info.Size()) || (o.SourceModifiedMs > 0 && o.SourceModifiedMs != info.ModTime().UnixMilli()) {
		return "", fmt.Errorf("source file has changed; add it again")
	}
	dir := settings.OutputDir
	if dir == "" {
		dir = filepath.Dir(input)
	}
	if err = os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	workspace, err := os.MkdirTemp(dir, ".nyacatch-compress-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(workspace)
	if err = writeCompressionSubtitle(workspace, o.Subtitle, source); err != nil {
		return "", err
	}
	output := filepath.Join(workspace, "result."+format)
	duration := source.duration
	args := []string{"-hide_banner", "-nostdin", "-y", "-filter_threads", "1", "-threads", "2", "-protocol_whitelist", "file"}
	if o.Trial != nil {
		args = append(args, "-ss", fmt.Sprintf("%.3f", float64(o.Trial.StartMs)/1000))
		duration = time.Duration(o.Trial.EndMs-o.Trial.StartMs) * time.Millisecond
	}
	args = append(args, "-i", input)
	if o.Trial != nil && o.Audio == "copy" && source.audio >= 0 {
		// Input seeking keeps copied audio preroll. Drop negative-time packets
		// before muxing; otherwise MKV shifts the video by the entire seek offset.
		args = append(args, "-ss", "0")
	}
	if o.Trial != nil {
		args = append(args, "-t", strconv.FormatFloat(duration.Seconds(), 'f', 3, 64))
	} else if o.TargetBytes > 0 {
		// The full budget describes the video timeline, including its AAC track.
		args = append(args, "-t", strconv.FormatFloat(duration.Seconds(), 'f', 3, 64))
	}
	args = append(args, "-map", fmt.Sprintf("0:%d", source.video))
	if source.audio >= 0 {
		args = append(args, "-map", fmt.Sprintf("0:%d", source.audio))
	}
	args = append(args, "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1")
	startMs := int64(0)
	if o.Trial != nil {
		startMs = o.Trial.StartMs
	}
	filters := compressionFilters(settings.MaxEdge, o.FPS, o.Subtitle, startMs)
	args = append(args, "-vf", strings.Join(filters, ","))
	args = append(args, compressionVideoArgs(o)...)
	if o.Codec == "hevc" {
		if format == "mp4" {
			args = append(args, "-tag:v", "hvc1")
		}
	}
	directory := ""
	if o.Subtitle != nil {
		directory = workspace
	}
	finalProgress := progress
	if o.TargetBytes > 0 {
		audioRate := 0
		if source.audio >= 0 {
			audioRate = o.Bitrate
		}
		rate, err := core.CompressionTargetBitrate(o.TargetBytes, int64(math.Round(source.duration.Seconds()*1000)), audioRate)
		if err != nil {
			return "", err
		}
		args = append(args, "-b:v", strconv.Itoa(rate))
		passArgs := func(pass string) []string {
			if o.Codec == "hevc" {
				return []string{"-x265-params", "pools=2:frame-threads=1:log-level=error:pass=" + pass + ":stats=pass-stats"}
			}
			return []string{"-pass", pass, "-passlogfile", "pass-stats"}
		}
		first := append(append([]string{}, args...), passArgs("1")...)
		first = append(first, "-an", "-f", "null", "-")
		if err := c.executeInDirectory(ctx, first, duration, func(p int) {
			if progress != nil {
				progress(p * 45 / 100)
			}
		}, workspace); err != nil {
			return "", err
		}
		if progress != nil {
			progress(45)
		}
		args = append(args, passArgs("2")...)
		directory = workspace
		finalProgress = func(p int) {
			if progress != nil {
				progress(45 + p*54/100)
			}
		}
	}
	if source.audio >= 0 {
		if o.Audio == "copy" {
			args = append(args, "-c:a", "copy")
		} else {
			args = append(args, "-c:a", "aac", "-b:a", strconv.Itoa(o.Bitrate)+"k")
		}
	} else {
		args = append(args, "-an")
	}
	if format == "mp4" {
		args = append(args, "-movflags", "+faststart")
	}
	args = append(args, output)
	if err = c.executeInDirectory(ctx, args, duration, finalProgress, directory); err != nil {
		if o.Encoder == "nvenc" && ctx.Err() == nil {
			return "", fmt.Errorf("NVIDIA NVENC encoding failed; check your GPU/driver or select CPU: %w", err)
		}
		return "", err
	}
	if err = c.validateOutput(ctx, output, format); err != nil {
		return "", err
	}
	actual, err := c.inspectCompression(ctx, output)
	if err != nil {
		return "", err
	}
	expectedCodec := "h264"
	if o.Codec == "hevc" {
		expectedCodec = "hevc"
	}
	if actual.videoCodec != expectedCodec || math.Abs(actual.duration.Seconds()-duration.Seconds()) > math.Max(.35, duration.Seconds()*.02) {
		return "", fmt.Errorf("compressed output failed video validation (codec %s, duration %.3fs; expected %s, %.3fs)", actual.videoCodec, actual.duration.Seconds(), expectedCodec, duration.Seconds())
	}
	if source.audio >= 0 {
		expectedAudio := source.audioCodec
		if o.Audio == "aac" {
			expectedAudio = "aac"
		}
		if actual.audioCodec != expectedAudio {
			return "", fmt.Errorf("compressed output failed audio validation")
		}
	}
	if ctx.Err() != nil {
		return "", fmt.Errorf("compression cancelled")
	}
	if o.TargetBytes > 0 && o.Trial == nil {
		info, err := os.Stat(output)
		if err != nil {
			return "", err
		}
		if info.Size() > o.TargetBytes {
			return "", fmt.Errorf("encoded output exceeds target size; increase the target size and retry")
		}
	}
	base := strings.TrimSuffix(filepath.Base(input), filepath.Ext(input)) + "-compressed"
	if o.Trial != nil {
		base = strings.TrimSuffix(filepath.Base(input), filepath.Ext(input)) + fmt.Sprintf("-trial-%d-%d", o.Trial.StartMs, o.Trial.EndMs)
	}
	return copyConversionOutput(ctx, output, dir, base, format)
}
