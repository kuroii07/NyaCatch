package core

import (
	"fmt"
	"math"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// ConversionOptions is saved with the task; nil retains the pre-0.9 defaults.
type ConversionOptions struct {
	Mux          *MuxOptions         `json:"mux,omitempty"`
	Compress     *CompressionOptions `json:"compress,omitempty"`
	Capture      *CaptureRange       `json:"capture,omitempty"`
	Trim         *TrimRange          `json:"trim,omitempty"`
	Merge        *MergeSources       `json:"merge,omitempty"`
	Version      int                 `json:"version"`
	OutputDir    string              `json:"outputDir,omitempty"`
	MaxEdge      int                 `json:"maxEdge,omitempty"`
	AudioBitrate int                 `json:"audioBitrate,omitempty"`
}

type CaptureRange struct {
	StartMs int64  `json:"startMs"`
	EndMs   int64  `json:"endMs,omitempty"`
	FPS     int    `json:"fps,omitempty"`
	Loop    bool   `json:"loop,omitempty"`
	Name    string `json:"name,omitempty"`
}

// Paths retain the user's exact ordering, including intentional repeats.
type MergeSources struct {
	Paths []string `json:"paths"`
	Name  string   `json:"name"`
}

type TrimRange struct {
	StartMs int64  `json:"startMs"`
	EndMs   int64  `json:"endMs"`
	Name    string `json:"name,omitempty"`
}

// Keep optional clip names portable and confined to one filename component.
var invalidTrimName = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f\x7f]`)
var reservedTrimName = regexp.MustCompile(`(?i)^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]|CONIN\$|CONOUT\$)(\.|$)`)

func ValidTrimName(name string) bool {
	return name == "" || (utf8.ValidString(name) && utf8.RuneCountInString(name) <= 80 && strings.TrimSpace(name) == name && !strings.HasSuffix(name, ".") && !invalidTrimName.MatchString(name) && !reservedTrimName.MatchString(name))
}

func (o *ConversionOptions) Validate(format string) error {
	if o == nil {
		if format == "gif" {
			return fmt.Errorf("GIF output requires capture options")
		}
		return nil
	}
	if o.Version != 1 {
		return fmt.Errorf("unsupported conversion options version")
	}
	if o.Mux != nil {
		if err := o.validateMux(format); err != nil {
			return err
		}
	}
	if o.Compress != nil {
		if err := o.validateCompression(format); err != nil {
			return err
		}
	}
	if format == "gif" && o.Capture == nil {
		return fmt.Errorf("GIF output requires capture options")
	}
	if o.Capture != nil {
		r := o.Capture
		if o.Trim != nil || o.Merge != nil || o.AudioBitrate != 0 || !ValidTrimName(r.Name) || r.StartMs < 0 || r.StartMs > math.MaxInt64/int64(time.Millisecond) {
			return fmt.Errorf("invalid capture options")
		}
		switch format {
		case "png", "jpg", "webp":
			if r.EndMs != 0 || r.FPS != 0 || r.Loop {
				return fmt.Errorf("single frame capture cannot have a range, frame rate or loop")
			}
		case "gif":
			// Zero retains source timestamps. 5/15 remain valid for saved 0.17.0 jobs.
			if r.EndMs <= r.StartMs || r.EndMs-r.StartMs > 30000 || r.EndMs > math.MaxInt64/int64(time.Millisecond) || (r.FPS != 0 && r.FPS != 5 && r.FPS != 6 && r.FPS != 10 && r.FPS != 12 && r.FPS != 15 && r.FPS != 24) || o.MaxEdge < 0 || o.MaxEdge > 960 {
				return fmt.Errorf("GIF requires up to 30 seconds and a supported frame rate")
			}
		default:
			return fmt.Errorf("capture requires PNG, JPG, WebP or GIF output")
		}
	}
	if format == "original" && (o.Trim != nil || o.Merge != nil || o.MaxEdge != 0 || o.AudioBitrate != 0) {
		return fmt.Errorf("original audio extraction cannot trim, merge, resize or change bitrate")
	}
	if o.Merge != nil {
		if o.Trim != nil || o.MaxEdge != 0 || o.AudioBitrate != 0 || len(o.Merge.Paths) < 2 || len(o.Merge.Paths) > 20 || o.Merge.Name == "" || !ValidTrimName(o.Merge.Name) {
			return fmt.Errorf("invalid merge options")
		}
		switch format {
		case "mp4", "mkv", "mp3", "m4a", "aac", "flac", "wav", "ogg", "opus":
		default:
			return fmt.Errorf("unsupported merge output format")
		}
		for _, file := range o.Merge.Paths {
			if !filepath.IsAbs(file) || len(file) > 4096 || strings.ContainsRune(file, 0) {
				return fmt.Errorf("merge requires absolute local file paths")
			}
		}
	}
	if o.Trim != nil {
		if !ValidTrimName(o.Trim.Name) {
			return fmt.Errorf("invalid trim output name")
		}
		if o.Trim.StartMs < 0 || o.Trim.EndMs <= o.Trim.StartMs || o.Trim.EndMs > math.MaxInt64/int64(time.Millisecond) {
			return fmt.Errorf("invalid trim range")
		}
		switch format {
		case "png", "jpg", "webp", "bmp":
			return fmt.Errorf("trimming requires video or audio output")
		}
	}
	if o.OutputDir != "" && (!filepath.IsAbs(o.OutputDir) || len(o.OutputDir) > 4096) {
		return fmt.Errorf("output directory must be an absolute path")
	}
	if o.MaxEdge != 0 && (o.MaxEdge < 16 || o.MaxEdge > 8192) {
		return fmt.Errorf("maximum edge must be between 16 and 8192 pixels")
	}
	videoOrImage := false
	switch format {
	case "mp4", "mkv", "mov", "webm", "flv", "ts", "avi", "m4v", "png", "jpg", "webp", "bmp", "gif":
		videoOrImage = true
	}
	if o.MaxEdge != 0 && !videoOrImage {
		return fmt.Errorf("image sizing is unavailable for audio output")
	}
	lossyAudio := false
	switch format {
	case "mp3", "aac", "m4a", "ogg", "opus":
		lossyAudio = true
	}
	switch o.AudioBitrate {
	case 0, 64, 96, 128, 192, 256, 320:
	default:
		return fmt.Errorf("unsupported audio bitrate")
	}
	if (format == "ogg" && o.AudioBitrate > 192) || (format == "opus" && o.AudioBitrate > 256) {
		return fmt.Errorf("bitrate exceeds the supported range for this output format")
	}
	if o.AudioBitrate != 0 && !lossyAudio {
		return fmt.Errorf("explicit bitrate requires a lossy audio output")
	}
	return nil
}
