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

func (c *Converter) runCapture(ctx context.Context, input, format, quality string, progress ProgressCallback, options *core.ConversionOptions) (string, error) {
	source, err := c.inspectMergeSource(ctx, input)
	if err != nil {
		return "", err
	}
	capture := options.Capture
	sourceMs := int64(math.Round(source.duration.Seconds() * 1000))
	if source.video < 0 || source.width < 1 || source.height < 1 || source.width > 8192 || source.height > 8192 || capture.StartMs >= sourceMs || format == "gif" && capture.EndMs > sourceMs {
		return "", fmt.Errorf("capture requires an available video and a range within its duration")
	}
	dir := options.OutputDir
	if dir == "" {
		dir = filepath.Dir(input)
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	workspace, err := os.MkdirTemp(dir, ".nyacatch-capture-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(workspace)
	output := filepath.Join(workspace, "result."+format)
	start := strconv.FormatFloat(float64(capture.StartMs)/1000, 'f', 3, 64)
	filter := ""
	if options.MaxEdge > 0 {
		filter = fmt.Sprintf("scale=w='min(iw,%d)':h='min(ih,%d)':force_original_aspect_ratio=decrease", options.MaxEdge, options.MaxEdge)
	}
	inputArgs := []string{"-hide_banner", "-nostdin", "-y", "-filter_threads", "1", "-threads", "2", "-protocol_whitelist", "file", "-ss", start, "-i", input}
	duration := time.Second
	if format != "gif" {
		args := append(inputArgs, "-map", fmt.Sprintf("0:%d", source.video), "-an", "-sn", "-dn", "-frames:v", "1", "-threads", "1")
		if filter != "" {
			args = append(args, "-vf", filter)
		}
		if format == "jpg" {
			q := "3"
			if quality == "high" {
				q = "2"
			} else if quality == "low" {
				q = "6"
			}
			args = append(args, "-q:v", q)
		}
		if format == "webp" {
			q := "85"
			if quality == "high" {
				q = "95"
			} else if quality == "low" {
				q = "65"
			}
			args = append(args, "-quality", q)
		}
		args = append(args, output)
		if err := c.execute(ctx, args, duration, progress); err != nil {
			return "", err
		}
	} else {
		duration = time.Duration(capture.EndMs-capture.StartMs) * time.Millisecond
		seconds := strconv.FormatFloat(duration.Seconds(), 'f', 3, 64)
		inputArgs = []string{"-hide_banner", "-nostdin", "-y", "-filter_threads", "1", "-threads", "2", "-protocol_whitelist", "file", "-ss", start, "-t", seconds, "-i", input}
		filters := []string{}
		if capture.FPS > 0 {
			filters = append(filters, fmt.Sprintf("fps=%d", capture.FPS))
		}
		if filter != "" {
			filters = append(filters, filter)
		}
		filters = append(filters, "setpts=PTS-STARTPTS")
		scale := strings.Join(filters, ",")
		palette := filepath.Join(workspace, "palette.png")
		// Two sequential passes keep only a palette, rather than buffering all frames.
		// Include whole frames: difference-only statistics can omit scene colors.
		paletteArgs := append(append([]string{}, inputArgs...), "-map", fmt.Sprintf("0:%d", source.video), "-an", "-sn", "-dn", "-vf", scale+",palettegen=stats_mode=full", "-frames:v", "1", "-threads", "1", palette)
		if err := c.execute(ctx, paletteArgs, duration, func(value int) {
			if progress != nil {
				progress(value / 2)
			}
		}); err != nil {
			return "", err
		}
		loop := "-1"
		if capture.Loop {
			loop = "0"
		}
		args := append(append([]string{}, inputArgs...), "-i", palette, "-t", seconds, "-filter_complex_threads", "1", "-filter_complex", fmt.Sprintf("[0:%d]%s[frames];[frames][1:v:0]paletteuse=dither=sierra2_4a[out]", source.video, scale), "-map", "[out]", "-fps_mode", "passthrough", "-an", "-sn", "-dn", "-loop", loop, "-threads", "1", output)
		if err := c.execute(ctx, args, duration, func(value int) {
			if progress != nil {
				progress(50 + value/2)
			}
		}); err != nil {
			return "", err
		}
	}
	if ctx.Err() != nil {
		return "", fmt.Errorf("capture cancelled")
	}
	if err := c.validateOutput(ctx, output, format); err != nil {
		return "", err
	}
	if format == "gif" {
		actual, err := c.inspectMergeSource(ctx, output)
		if err != nil || math.Abs(actual.duration.Seconds()-duration.Seconds()) > math.Max(.25, duration.Seconds()*.03) {
			return "", fmt.Errorf("GIF output failed duration validation")
		}
	}
	name := capture.Name
	if name == "" {
		name = strings.TrimSuffix(filepath.Base(input), filepath.Ext(input))
		if format == "gif" {
			name += fmt.Sprintf("-gif-%d-%d", capture.StartMs, capture.EndMs)
		} else {
			name += fmt.Sprintf("-frame-%d", capture.StartMs)
		}
	}
	return copyConversionOutput(ctx, output, dir, name, format)
}
