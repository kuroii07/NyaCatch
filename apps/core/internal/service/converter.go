package service

import (
	"bufio"
	"caorushizi.cn/mediago/internal/core"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ProgressCallback is called with the conversion progress (0-100).
type ProgressCallback func(progress int)

// Converter manages ffmpeg conversion processes.
type Converter struct {
	ffmpegBin      string
	mu             sync.Mutex
	cancels        map[int64]context.CancelFunc
	slots          chan struct{}
	encoderGate    chan struct{}
	encoderCache   CompressionEncoders
	encoderChecked time.Time
}

// NewConverter creates a Converter with the given ffmpeg binary path.
func NewConverter(ffmpegBin string) *Converter {
	return &Converter{
		ffmpegBin:   ffmpegBin,
		cancels:     make(map[int64]context.CancelFunc),
		slots:       make(chan struct{}, 2),
		encoderGate: make(chan struct{}, 1),
	}
}

// Start begins an ffmpeg conversion. It blocks until the conversion completes or is cancelled.
// The onProgress callback is called periodically with the current progress percentage.
func (c *Converter) Start(id int64, inputPath, outputFormat, quality string, onProgress ProgressCallback, options ...*core.ConversionOptions) (outputPath string, err error) {
	ctx, err := c.reserve(id)
	if err != nil {
		return "", err
	}
	return c.run(ctx, id, inputPath, outputFormat, quality, onProgress, options...)
}

func (c *Converter) reserve(id int64) (context.Context, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, exists := c.cancels[id]; exists {
		return nil, fmt.Errorf("conversion is already running")
	}
	ctx, cancel := context.WithCancel(context.Background())
	c.cancels[id] = cancel
	return ctx, nil
}

func (c *Converter) release(id int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if cancel, exists := c.cancels[id]; exists {
		cancel()
		delete(c.cancels, id)
	}
}

func (c *Converter) run(ctx context.Context, id int64, inputPath, outputFormat, quality string, onProgress ProgressCallback, options ...*core.ConversionOptions) (outputPath string, err error) {
	defer c.release(id)
	if len(options) > 1 {
		return "", fmt.Errorf("only one conversion option set is supported")
	}
	var settings *core.ConversionOptions
	if len(options) == 1 {
		settings = options[0]
	}
	if err := settings.Validate(outputFormat); err != nil {
		return "", err
	}
	if c.ffmpegBin == "" {
		return "", fmt.Errorf("ffmpeg binary path not configured")
	}
	if !supportedConversionFormat(outputFormat) {
		return "", fmt.Errorf("unsupported output format: %s", outputFormat)
	}
	if quality != "high" && quality != "medium" && quality != "low" {
		return "", fmt.Errorf("unsupported quality")
	}
	info, err := os.Stat(inputPath)
	if err != nil {
		return "", fmt.Errorf("input file unavailable: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("input must be a regular file")
	}
	select {
	case c.slots <- struct{}{}:
		defer func() { <-c.slots }()
	case <-ctx.Done():
		return "", fmt.Errorf("conversion cancelled")
	}
	if settings != nil && settings.Merge != nil {
		return c.runMerge(ctx, inputPath, outputFormat, quality, onProgress, settings)
	}
	if settings != nil && settings.Mux != nil {
		return c.runMux(ctx, inputPath, outputFormat, onProgress, settings)
	}
	if settings != nil && settings.Compress != nil {
		return c.runCompression(ctx, inputPath, outputFormat, onProgress, settings)
	}
	if settings != nil && settings.Capture != nil {
		return c.runCapture(ctx, inputPath, outputFormat, quality, onProgress, settings)
	}
	if outputFormat == "original" {
		return c.extractOriginalAudio(ctx, inputPath, onProgress, settings)
	}

	var trimDuration time.Duration
	if settings != nil && settings.Trim != nil {
		if err := c.validateTrimSource(ctx, inputPath, outputFormat, settings.Trim); err != nil {
			return "", err
		}
		trimDuration = time.Duration(settings.Trim.EndMs-settings.Trim.StartMs) * time.Millisecond
	}
	dir := filepath.Dir(inputPath)
	if settings != nil && settings.OutputDir != "" {
		dir = settings.OutputDir
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("cannot create output directory: %w", err)
	}
	base := strings.TrimSuffix(filepath.Base(inputPath), filepath.Ext(inputPath))
	if trimDuration > 0 {
		if settings.Trim.Name != "" {
			base = settings.Trim.Name
		} else {
			base += fmt.Sprintf("-clip-%d-%d", settings.Trim.StartMs, settings.Trim.EndMs)
		}
	}
	tmp, err := os.CreateTemp(dir, ".nyacatch-convert-*."+outputFormat)
	if err != nil {
		return "", fmt.Errorf("cannot create output: %w", err)
	}
	tmpPath := tmp.Name()
	if err = tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return "", err
	}
	defer os.Remove(tmpPath)

	// Get input duration for progress calculation
	duration := c.probeDuration(ctx, inputPath)
	if trimDuration > 0 {
		duration = trimDuration
	}

	// Build ffmpeg args
	args := buildFFmpegArgs(inputPath, tmpPath, outputFormat, quality, settings)
	if err := c.execute(ctx, args, duration, onProgress); err != nil {
		return "", err
	}
	if ctx.Err() != nil {
		return "", fmt.Errorf("conversion cancelled")
	}
	stat, err := os.Stat(tmpPath)
	if err != nil || stat.Size() == 0 {
		return "", fmt.Errorf("conversion produced an empty file")
	}
	if err := c.validateOutput(ctx, tmpPath, outputFormat); err != nil {
		return "", err
	}
	return copyConversionOutput(ctx, tmpPath, dir, base, outputFormat)
}

// All stages share the caller's reservation, cancellation and process-slot limit.
func (c *Converter) execute(ctx context.Context, args []string, duration time.Duration, onProgress ProgressCallback) error {
	return c.executeInDirectory(ctx, args, duration, onProgress, "")
}

func (c *Converter) executeInDirectory(ctx context.Context, args []string, duration time.Duration, onProgress ProgressCallback, directory string) error {
	cmd := exec.CommandContext(ctx, c.ffmpegBin, args...)
	cmd.Dir = directory
	configureMediaCommand(cmd)

	// ffmpeg writes progress to stderr
	stderr, pipeErr := cmd.StderrPipe()
	if pipeErr != nil {
		return fmt.Errorf("failed to get stderr pipe: %w", pipeErr)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start ffmpeg: %w", err)
	}

	// Always drain stderr, including images and files with no known duration.
	var lastLine string
	{
		scanner := bufio.NewScanner(stderr)
		scanner.Buffer(make([]byte, 4096), 1024*1024)
		scanner.Split(scanFFmpegOutput)
		timeRegex := regexp.MustCompile(`time=(\d+):(\d+):(\d+)\.(\d+)`)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.TrimSpace(line) != "" {
				lastLine = line
			}
			if matches := timeRegex.FindStringSubmatch(line); matches != nil && duration > 0 && onProgress != nil {
				h, _ := strconv.Atoi(matches[1])
				m, _ := strconv.Atoi(matches[2])
				s, _ := strconv.Atoi(matches[3])
				elapsed := time.Duration(h)*time.Hour + time.Duration(m)*time.Minute + time.Duration(s)*time.Second
				pct := int(float64(elapsed) / float64(duration) * 100)
				if pct > 100 {
					pct = 100
				}
				onProgress(pct)
			}
		}
		if scanner.Err() != nil {
			_, _ = io.Copy(io.Discard, stderr)
		}
	}

	if err := cmd.Wait(); err != nil {
		if ctx.Err() == context.Canceled {
			return fmt.Errorf("conversion cancelled")
		}
		return fmt.Errorf("ffmpeg failed: %s", strings.TrimSpace(lastLine))
	}
	if ctx.Err() != nil {
		return fmt.Errorf("conversion cancelled")
	}
	return nil
}

func (c *Converter) validateOutput(ctx context.Context, file, format string) error {
	probeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	probe := filepath.Join(filepath.Dir(c.ffmpegBin), "ffprobe"+filepath.Ext(c.ffmpegBin))
	cmd := exec.CommandContext(probeCtx, probe, "-v", "error", "-show_entries", "stream=codec_type:stream_disposition=attached_pic", "-of", "json", file)
	configureMediaCommand(cmd)
	data, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("cannot inspect converted output: %w", err)
	}
	var result struct {
		Streams []struct {
			CodecType   string `json:"codec_type"`
			Disposition struct {
				AttachedPic int `json:"attached_pic"`
			} `json:"disposition"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return fmt.Errorf("cannot inspect converted output: %w", err)
	}
	hasVideo, hasAudio := false, false
	for _, stream := range result.Streams {
		if stream.CodecType == "video" && stream.Disposition.AttachedPic == 0 {
			hasVideo = true
		}
		if stream.CodecType == "audio" {
			hasAudio = true
		}
	}
	switch format {
	case "gif", "mp4", "mkv", "mov", "webm", "flv", "ts", "avi", "m4v", "png", "jpg", "webp", "bmp":
		if !hasVideo {
			return fmt.Errorf("output has no video or image stream")
		}
	default:
		if !hasAudio {
			return fmt.Errorf("output has no audio stream")
		}
	}
	return nil
}

// Create the final name exclusively. No existing output or original is ever replaced.
func copyConversionOutput(ctx context.Context, tmpPath, dir, base, format string) (string, error) {
	in, err := os.Open(tmpPath)
	if err != nil {
		return "", err
	}
	defer in.Close()
	for i := 0; i < 10000; i++ {
		name := base + "." + format
		if i > 0 {
			name = fmt.Sprintf("%s (%d).%s", base, i, format)
		}
		output := filepath.Join(dir, name)
		f, err := os.OpenFile(output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if os.IsExist(err) {
			continue
		}
		if err != nil {
			return "", err
		}
		_, copyErr := io.Copy(f, &conversionContextReader{ctx: ctx, reader: in})
		closeErr := f.Close()
		if copyErr != nil || closeErr != nil || ctx.Err() != nil {
			_ = os.Remove(output)
			if copyErr != nil {
				return "", copyErr
			}
			if closeErr != nil {
				return "", closeErr
			}
			return "", fmt.Errorf("conversion cancelled")
		}
		return output, nil
	}
	return "", fmt.Errorf("no available output filename")
}

type conversionContextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r *conversionContextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

func supportedConversionFormat(format string) bool {
	switch format {
	case "gif", "original", "mp4", "mkv", "mov", "webm", "flv", "ts", "avi", "m4v", "mp3", "aac", "m4a", "flac", "wav", "ogg", "opus", "png", "jpg", "webp", "bmp":
		return true
	}
	return false
}

// Stop cancels a running conversion.
func (c *Converter) Stop(id int64) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if cancel, ok := c.cancels[id]; ok {
		cancel()
		return true
	}
	return false
}

// probeDuration uses ffprobe to get the input file duration.
func (c *Converter) probeDuration(ctx context.Context, inputPath string) time.Duration {
	ffprobe := filepath.Join(filepath.Dir(c.ffmpegBin), "ffprobe"+filepath.Ext(c.ffmpegBin))

	probeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(probeCtx, ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", inputPath)
	configureMediaCommand(cmd)
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	s := strings.TrimSpace(string(out))
	seconds, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return time.Duration(seconds * float64(time.Second))
}

// scanFFmpegOutput is a split function for bufio.Scanner that splits on \r or \n.
// ffmpeg uses \r for progress line overwrites.
func scanFFmpegOutput(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}
	for i := 0; i < len(data); i++ {
		if data[i] == '\r' || data[i] == '\n' {
			return i + 1, data[:i], nil
		}
	}
	if atEOF {
		return len(data), data, nil
	}
	return 0, nil, nil
}

// buildFFmpegArgs builds the ffmpeg command-line arguments for a given format and quality.
func buildFFmpegArgs(input, output, format, quality string, options ...*core.ConversionOptions) []string {
	var settings *core.ConversionOptions
	if len(options) > 0 {
		settings = options[0]
	}
	maxEdge, bitrate := 0, 0
	if settings != nil {
		maxEdge = settings.MaxEdge
		bitrate = settings.AudioBitrate
	}
	// Keep codec padding within an odd API-supplied edge limit as well.
	if maxEdge > 0 && maxEdge%2 != 0 && (format == "mp4" || format == "mkv" || format == "mov" || format == "webm" || format == "flv" || format == "ts" || format == "avi" || format == "m4v") {
		maxEdge--
	}
	audioRate := func(fallback string) string {
		if bitrate > 0 {
			return strconv.Itoa(bitrate) + "k"
		}
		return fallback
	}
	resize := ""
	if maxEdge > 0 {
		resize = fmt.Sprintf("scale=w='min(iw,%d)':h='min(ih,%d)':force_original_aspect_ratio=decrease", maxEdge, maxEdge)
	}
	videoFilter := "pad=ceil(iw/2)*2:ceil(ih/2)*2"
	if resize != "" {
		videoFilter = resize + "," + videoFilter
	}
	args := []string{"-hide_banner", "-nostdin", "-y"}
	if settings != nil && settings.Trim != nil {
		// Input seeking remains frame accurate while re-encoding; do not use
		// stream copy, which would move the cut to a nearby keyframe.
		args = append(args, "-protocol_whitelist", "file", "-ss", fmt.Sprintf("%.3f", float64(settings.Trim.StartMs)/1000))
	}
	args = append(args, "-i", input)
	switch format {
	case "mp3", "aac", "m4a", "flac", "wav", "ogg", "opus":
		args = append(args, "-map", "0:a:0")
	}
	if settings != nil && settings.Trim != nil {
		args = append(args, "-t", fmt.Sprintf("%.3f", float64(settings.Trim.EndMs-settings.Trim.StartMs)/1000))
	}

	switch format {
	case "mp4", "mkv", "mov", "flv", "ts", "m4v":
		crf := qualityCRF(quality)
		args = append(args, "-vf", videoFilter, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", strconv.Itoa(crf), "-c:a", "aac", "-b:a", "192k")
		if format == "m4v" {
			// FFmpeg infers raw MPEG-4 video from .m4v; use the Apple MP4
			// container explicitly so audio and normal player compatibility survive.
			args = append(args, "-f", "ipod")
		}
	case "avi":
		q := "5"
		if quality == "high" {
			q = "2"
		} else if quality == "low" {
			q = "9"
		}
		// MPEG-4 Part 2 and MP3 are broadly supported in legacy AVI players.
		args = append(args, "-vf", videoFilter, "-pix_fmt", "yuv420p", "-c:v", "mpeg4", "-q:v", q, "-c:a", "libmp3lame", "-b:a", "192k")
	case "webm":
		if resize != "" {
			args = append(args, "-vf", videoFilter)
		}
		crf := qualityCRF(quality)
		args = append(args, "-c:v", "libvpx-vp9", "-crf", strconv.Itoa(crf), "-b:v", "0", "-c:a", "libopus")
	case "mp3":
		args = append(args, "-vn", "-acodec", "libmp3lame", "-b:a", audioRate(audioQualityMP3(quality)))
	case "aac", "m4a":
		args = append(args, "-vn", "-acodec", "aac", "-b:a", audioRate(audioQualityAAC(quality)))
	case "flac":
		args = append(args, "-vn", "-acodec", "flac")
	case "wav":
		args = append(args, "-vn", "-acodec", "pcm_s16le")
	case "ogg":
		q := "5"
		if quality == "high" {
			q = "7"
		} else if quality == "low" {
			q = "3"
		}
		if bitrate > 0 {
			args = append(args, "-vn", "-acodec", "libvorbis", "-b:a", audioRate(""))
		} else {
			args = append(args, "-vn", "-acodec", "libvorbis", "-q:a", q)
		}
	case "opus":
		args = append(args, "-vn", "-acodec", "libopus", "-b:a", audioRate(audioQualityAAC(quality)))
	case "png", "jpg", "webp", "bmp":
		if resize != "" {
			args = append(args, "-vf", resize)
		}
		args = append(args, "-frames:v", "1", "-threads", "1", "-update", "1")
		if format == "jpg" {
			q := "4"
			if quality == "high" {
				q = "2"
			} else if quality == "low" {
				q = "8"
			}
			args = append(args, "-q:v", q)
		}
		if format == "webp" {
			q := "75"
			if quality == "high" {
				q = "90"
			} else if quality == "low" {
				q = "55"
			}
			args = append(args, "-quality", q)
		}
	}

	args = append(args, output)
	return args
}

func qualityCRF(quality string) int {
	switch quality {
	case "high":
		return 18
	case "low":
		return 28
	default:
		return 23
	}
}

func audioQualityMP3(quality string) string {
	switch quality {
	case "high":
		return "320k"
	case "low":
		return "128k"
	default:
		return "192k"
	}
}

func audioQualityAAC(quality string) string {
	switch quality {
	case "high":
		return "256k"
	case "low":
		return "96k"
	default:
		return "128k"
	}
}
