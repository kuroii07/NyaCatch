package core

import (
	"fmt"
	"path/filepath"
	"strings"
)

// Snapshots are filled from stat by the service; old records have no mux field.
type MuxOptions struct {
	SubtitlePath     string `json:"subtitlePath,omitempty"`
	SubtitleHash     string `json:"subtitleHash,omitempty"`
	ConvertSubtitle  bool   `json:"convertSubtitle,omitempty"`
	AudioPath        string `json:"audioPath,omitempty"`
	SourceBytes      int64  `json:"sourceBytes,omitempty"`
	SourceModifiedMs int64  `json:"sourceModifiedMs,omitempty"`
	AudioBytes       int64  `json:"audioBytes,omitempty"`
	AudioModifiedMs  int64  `json:"audioModifiedMs,omitempty"`
}

func (o *ConversionOptions) validateMux(format string) error {
	if o.Trim != nil || o.Merge != nil || o.Capture != nil || o.Compress != nil || o.MaxEdge != 0 || o.AudioBitrate != 0 {
		return fmt.Errorf("muxing cannot resize, re-encode, trim, merge or compress")
	}
	if format != "mp4" && format != "mkv" && format != "mov" && format != "ts" {
		return fmt.Errorf("unsupported mux container")
	}
	p := o.Mux.AudioPath
	if p != "" && (!filepath.IsAbs(p) || len(p) > 4096 || strings.ContainsRune(p, 0)) {
		return fmt.Errorf("external audio must be an absolute local path")
	}
	p = o.Mux.SubtitlePath
	if p != "" && (!filepath.IsAbs(p) || len(p) > 4096 || strings.ContainsRune(p, 0) || (strings.ToLower(filepath.Ext(p)) != ".srt" && strings.ToLower(filepath.Ext(p)) != ".ass")) {
		return fmt.Errorf("external subtitle must be a local SRT or ASS file")
	}
	if (o.Mux.SubtitleHash != "" || o.Mux.ConvertSubtitle) && p == "" {
		return fmt.Errorf("subtitle options require a subtitle file")
	}
	if h := o.Mux.SubtitleHash; h != "" {
		if len(h) != 64 || strings.Trim(h, "0123456789abcdef") != "" {
			return fmt.Errorf("invalid subtitle hash")
		}
	}
	return nil
}
