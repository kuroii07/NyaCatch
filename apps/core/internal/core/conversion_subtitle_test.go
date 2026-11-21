package core

import (
	"path/filepath"
	"testing"
)

func TestCompressionSubtitleOptions(t *testing.T) {
	makeSub := func() *CompressionSubtitle {
		return &CompressionSubtitle{Path: filepath.Join(t.TempDir(), "字幕.srt"), Style: &SubtitleStyle{FontFamily: "Microsoft YaHei", FontSize: 48, Color: "#FFFFFF", OutlineColor: "#000000", Outline: 2, Position: "bottom"}}
	}
	if err := makeSub().Validate(); err != nil {
		t.Fatal(err)
	}
	for _, edit := range []func(*CompressionSubtitle){func(s *CompressionSubtitle) { s.Path = "relative.srt" }, func(s *CompressionSubtitle) { s.Path += ".txt" }, func(s *CompressionSubtitle) { s.OffsetMs = 3600001 }, func(s *CompressionSubtitle) { s.SourceHash = "bad" }, func(s *CompressionSubtitle) { s.Style = nil }, func(s *CompressionSubtitle) { s.Style.FontFamily = "Arial,FontSize=900" }, func(s *CompressionSubtitle) { s.Style.FontSize = 0 }, func(s *CompressionSubtitle) { s.Style.Color = "white" }, func(s *CompressionSubtitle) { s.Style.Outline = 9 }, func(s *CompressionSubtitle) { s.Style.Position = "invalid" }} {
		s := makeSub()
		edit(s)
		if s.Validate() == nil {
			t.Fatal("invalid subtitle accepted", s)
		}
	}
	s := makeSub()
	s.Path = filepath.Join(t.TempDir(), "字幕.ass")
	if s.Validate() == nil {
		t.Fatal("ASS cannot override styles")
	}
	s.Style = nil
	s.OffsetMs = -500
	if err := s.Validate(); err != nil {
		t.Fatal(err)
	}
}
