package core

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"
)

type CompressionSubtitle struct {
	Path       string         `json:"path"`
	OffsetMs   int64          `json:"offsetMs"`
	Style      *SubtitleStyle `json:"style,omitempty"`
	SourceHash string         `json:"sourceHash,omitempty"`
}
type SubtitleStyle struct {
	FontFamily   string `json:"fontFamily"`
	FontSize     int    `json:"fontSize"`
	Color        string `json:"color"`
	OutlineColor string `json:"outlineColor"`
	Outline      int    `json:"outline"`
	Position     string `json:"position"`
}

var subtitleHash = regexp.MustCompile(`^[a-f0-9]{64}$`)
var subtitleColor = regexp.MustCompile(`^#[a-fA-F0-9]{6}$`)

func (s *CompressionSubtitle) Validate() error {
	if s == nil {
		return nil
	}
	ext := strings.ToLower(filepath.Ext(s.Path))
	if !filepath.IsAbs(s.Path) || len(s.Path) > 4096 || !utf8.ValidString(s.Path) || strings.ContainsRune(s.Path, 0) || (ext != ".srt" && ext != ".ass") || s.OffsetMs < -3600000 || s.OffsetMs > 3600000 || (s.SourceHash != "" && !subtitleHash.MatchString(s.SourceHash)) {
		return fmt.Errorf("invalid subtitle path, offset or snapshot")
	}
	if ext == ".ass" {
		if s.Style != nil {
			return fmt.Errorf("ASS retains its original styles")
		}
		return nil
	}
	v := s.Style
	if v == nil || v.FontSize < 16 || v.FontSize > 96 || v.Outline < 0 || v.Outline > 8 || !subtitleColor.MatchString(v.Color) || !subtitleColor.MatchString(v.OutlineColor) || (v.Position != "top" && v.Position != "middle" && v.Position != "bottom") {
		return fmt.Errorf("invalid SRT style")
	}
	switch v.FontFamily {
	case "Microsoft YaHei", "SimHei", "SimSun", "Arial":
	default:
		return fmt.Errorf("unsupported subtitle font")
	}
	return nil
}
