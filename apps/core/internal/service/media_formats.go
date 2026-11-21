package service

import (
	"regexp"
	"strings"
)

// MediaFormat describes a choice, never an expiring signed download URL.
type MediaFormat struct {
	ID          string  `json:"id"`
	Extension   string  `json:"extension"`
	Width       int     `json:"width"`
	Height      int     `json:"height"`
	FPS         float64 `json:"fps"`
	VideoCodec  string  `json:"videoCodec"`
	AudioCodec  string  `json:"audioCodec"`
	Filesize    int64   `json:"filesize"`
	Approximate bool    `json:"approximate"`
	AudioOnly   bool    `json:"audioOnly"`
}

type rawMediaFormat struct {
	ID              string  `json:"format_id"`
	Ext             string  `json:"ext"`
	Width           int     `json:"width"`
	Height          int     `json:"height"`
	FPS             float64 `json:"fps"`
	VCodec          string  `json:"vcodec"`
	ACodec          string  `json:"acodec"`
	Filesize        int64   `json:"filesize"`
	ApproximateSize int64   `json:"filesize_approx"`
}

var safeFormatID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)

func (f rawMediaFormat) tracks() (video, audio bool) {
	video = f.VCodec != "" && f.VCodec != "none"
	audio = f.ACodec != "" && f.ACodec != "none"
	// An explicit absence of video on a media format identifies an audio
	// track even when the extractor cannot report its codec. Keep the codec unknown.
	if f.VCodec == "none" && f.ACodec == "" {
		switch strings.ToLower(f.Ext) {
		case "mp4", "m4a", "webm", "mp3", "aac", "ogg", "opus", "wav", "flac":
			audio = true
		}
	}
	return
}

func normalizeFormats(raw []rawMediaFormat) []MediaFormat {
	formats := make([]MediaFormat, 0, len(raw))
	seen := make(map[string]bool)
	for _, f := range raw {
		video, audio := f.tracks()
		if !safeFormatID.MatchString(f.ID) || !mediaExtension.MatchString(f.Ext) || (!video && !audio) || seen[f.ID] {
			continue
		}
		size, approx := f.Filesize, false
		if size <= 0 && f.ApproximateSize > 0 {
			size, approx = f.ApproximateSize, true
		}
		formats = append(formats, MediaFormat{ID: f.ID, Extension: f.Ext, Width: max(0, f.Width), Height: max(0, f.Height), FPS: max(0, f.FPS), VideoCodec: f.VCodec, AudioCodec: f.ACodec, Filesize: max(0, size), Approximate: approx, AudioOnly: !video && audio})
		seen[f.ID] = true
	}
	return formats
}
