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

type mergeMedia struct {
	duration                                      time.Duration
	width, height, video, audio                   int
	videoDuration                                 time.Duration
	videoCodec, audioCodec, transfer, pixelFormat string
	bitDepth                                      int
}

func (c *Converter) inspectMergeSource(ctx context.Context, file string) (mergeMedia, error) {
	result := mergeMedia{video: -1, audio: -1}
	stat, err := os.Stat(file)
	if err != nil || !stat.Mode().IsRegular() {
		return result, fmt.Errorf("merge source is unavailable")
	}
	probeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	probe := filepath.Join(filepath.Dir(c.ffmpegBin), "ffprobe"+filepath.Ext(c.ffmpegBin))
	cmd := exec.CommandContext(probeCtx, probe, "-v", "error", "-protocol_whitelist", "file", "-show_entries", "format=duration:stream=index,codec_type,codec_name,width,height,duration,color_transfer,pix_fmt,bits_per_raw_sample:stream_disposition=attached_pic:stream_tags=rotate,DURATION:stream_side_data=rotation", "-of", "json", file)
	configureMediaCommand(cmd)
	raw, err := cmd.Output()
	if err != nil {
		return result, fmt.Errorf("cannot inspect merge source: %w", err)
	}
	var data struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
		Streams []struct {
			Index       int    `json:"index"`
			Type        string `json:"codec_type"`
			Width       int    `json:"width"`
			Height      int    `json:"height"`
			Duration    string `json:"duration"`
			Codec       string `json:"codec_name"`
			Transfer    string `json:"color_transfer"`
			PixelFormat string `json:"pix_fmt"`
			BitDepth    string `json:"bits_per_raw_sample"`
			Disposition struct {
				Attached int `json:"attached_pic"`
			} `json:"disposition"`
			Tags struct {
				Rotate   string `json:"rotate"`
				Duration string `json:"DURATION"`
			} `json:"tags"`
			SideData []struct {
				Rotation float64 `json:"rotation"`
			} `json:"side_data_list"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return result, fmt.Errorf("invalid merge metadata: %w", err)
	}
	seconds, _ := strconv.ParseFloat(data.Format.Duration, 64)
	trackDuration := 0.0
	for _, stream := range data.Streams {
		if duration, err := strconv.ParseFloat(stream.Duration, 64); err == nil && duration > trackDuration && !math.IsInf(duration, 0) {
			trackDuration = duration
		}
		if stream.Type == "audio" && result.audio < 0 {
			result.audio = stream.Index
			result.audioCodec = stream.Codec
		}
		if stream.Type == "video" && stream.Disposition.Attached == 0 && result.video < 0 {
			result.video, result.width, result.height = stream.Index, stream.Width, stream.Height
			result.videoCodec, result.transfer, result.pixelFormat = stream.Codec, stream.Transfer, stream.PixelFormat
			result.bitDepth, _ = strconv.Atoi(stream.BitDepth)
			d, _ := strconv.ParseFloat(stream.Duration, 64)
			if d <= 0 || math.IsNaN(d) || math.IsInf(d, 0) {
				var hours, minutes int
				var seconds float64
				if _, err := fmt.Sscanf(stream.Tags.Duration, "%d:%d:%f", &hours, &minutes, &seconds); err == nil && hours >= 0 && minutes >= 0 && minutes < 60 && seconds >= 0 && seconds < 60 {
					d = float64(hours)*3600 + float64(minutes)*60 + seconds
				}
			}
			if d > 0 && !math.IsInf(d, 0) && d < 1e8 {
				result.videoDuration = time.Duration(d * float64(time.Second))
			}
			rotation, _ := strconv.ParseFloat(stream.Tags.Rotate, 64)
			for _, side := range stream.SideData {
				rotation = side.Rotation
			}
			if int(math.Abs(math.Round(rotation)))%180 == 90 {
				result.width, result.height = result.height, result.width
			}
		}
	}
	if seconds <= 0 || math.IsNaN(seconds) || math.IsInf(seconds, 0) {
		seconds = trackDuration
	}
	if seconds <= 0 || math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds > float64(math.MaxInt64/int64(time.Second))/20 {
		return result, fmt.Errorf("merge source duration is unavailable")
	}
	result.duration = time.Duration(seconds * float64(time.Second))
	return result, nil
}

func (c *Converter) runMerge(ctx context.Context, input, format, quality string, progress ProgressCallback, settings *core.ConversionOptions) (string, error) {
	merge := settings.Merge
	if merge.Paths[0] != input {
		return "", fmt.Errorf("merge source mismatch")
	}
	video := format == "mp4" || format == "mkv"
	media := make([]mergeMedia, len(merge.Paths))
	var total time.Duration
	hasAudio := false
	for i, file := range merge.Paths {
		info, err := c.inspectMergeSource(ctx, file)
		if err != nil {
			return "", fmt.Errorf("merge input %d: %w", i+1, err)
		}
		if video && (info.video < 0 || info.width < 1 || info.height < 1 || info.width > 8192 || info.height > 8192) || !video && (info.video >= 0 || info.audio < 0) {
			return "", fmt.Errorf("merge requires only videos or only audio files")
		}
		media[i] = info
		total += info.duration
		hasAudio = hasAudio || info.audio >= 0
	}
	dir := settings.OutputDir
	if dir == "" {
		dir = filepath.Dir(input)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("cannot create merge output directory: %w", err)
	}
	workspace, err := os.MkdirTemp(dir, ".nyacatch-merge-*")
	if err != nil {
		return "", err
	}
	// This directory is generated by this job and never contains user paths.
	defer os.RemoveAll(workspace)
	width, height := media[0].width, media[0].height
	width += width % 2
	height += height % 2
	var list strings.Builder
	var completed time.Duration
	for i, file := range merge.Paths {
		info := media[i]
		ext := ".wav"
		if video {
			ext = ".mkv"
		}
		name := fmt.Sprintf("%03d%s", i, ext)
		args := []string{"-hide_banner", "-nostdin", "-y", "-protocol_whitelist", "file", "-i", file}
		seconds := strconv.FormatFloat(info.duration.Seconds(), 'f', 6, 64)
		if video {
			if hasAudio && info.audio < 0 {
				args = append(args, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo")
			}
			filter := fmt.Sprintf("setpts=PTS-STARTPTS,scale=w='min(iw,%d)':h='min(ih,%d)':force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=%s", width, height, width, height, seconds)
			args = append(args, "-map", fmt.Sprintf("0:%d", info.video), "-vf", filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", strconv.Itoa(qualityCRF(quality)), "-pix_fmt", "yuv420p", "-threads", "2")
		}
		if hasAudio {
			audio := fmt.Sprintf("0:%d", info.audio)
			if info.audio < 0 {
				audio = "1:a:0"
			}
			args = append(args, "-map", audio, "-af", "aresample=48000:async=1:first_pts=0,apad", "-ac", "2", "-ar", "48000")
			if video {
				args = append(args, "-c:a", "pcm_s16le")
			} else {
				args = append(args, "-vn", "-c:a", "pcm_s16le")
			}
		} else {
			args = append(args, "-an")
		}
		args = append(args, "-map_metadata", "-1", "-t", seconds, filepath.Join(workspace, name))
		before := completed
		if err := c.execute(ctx, args, info.duration, func(value int) {
			if progress != nil {
				progress(int((float64(before) + float64(info.duration)*float64(value)/100) / float64(total) * 90))
			}
		}); err != nil {
			return "", err
		}
		completed += info.duration
		fmt.Fprintf(&list, "file '%s'\n", name)
	}
	listPath := filepath.Join(workspace, "inputs.txt")
	if err := os.WriteFile(listPath, []byte(list.String()), 0600); err != nil {
		return "", err
	}
	output := filepath.Join(workspace, "result."+format)
	args := []string{"-hide_banner", "-nostdin", "-y", "-protocol_whitelist", "file", "-f", "concat", "-safe", "1", "-i", listPath}
	if video {
		args = append(args, "-map", "0:v:0", "-c:v", "copy")
		if hasAudio {
			args = append(args, "-map", "0:a:0", "-c:a", "aac", "-b:a", "192k")
		} else {
			args = append(args, "-an")
		}
		if format == "mp4" {
			args = append(args, "-movflags", "+faststart")
		}
		args = append(args, output)
	} else {
		// Reuse the established final audio codecs and quality mapping.
		codecArgs := buildFFmpegArgs(listPath, output, format, quality)
		index := 0
		for i, value := range codecArgs {
			if value == "-i" {
				index = i + 2
				break
			}
		}
		args = append(args, codecArgs[index:]...)
	}
	if err := c.execute(ctx, args, total, func(value int) {
		if progress != nil {
			progress(90 + value/10)
		}
	}); err != nil {
		return "", err
	}
	actual, err := c.inspectMergeSource(ctx, output)
	if err != nil {
		return "", err
	}
	if math.Abs(actual.duration.Seconds()-total.Seconds()) > math.Max(.25, total.Seconds()*.02) || video && actual.video < 0 || hasAudio && actual.audio < 0 {
		return "", fmt.Errorf("merged output failed duration or track validation")
	}
	return copyConversionOutput(ctx, output, dir, merge.Name, format)
}
