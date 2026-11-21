package core

import "testing"

func TestMuxSubtitleOptions(t *testing.T) {
	for _, sub := range []string{`C:\字幕.srt`, `C:\样式.ass`} {
		o := &ConversionOptions{Version: 1, Mux: &MuxOptions{SubtitlePath: sub, SubtitleHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}
		if err := o.Validate("mkv"); err != nil {
			t.Fatal(err)
		}
	}
	for _, s := range []*MuxOptions{{SubtitlePath: "relative.srt"}, {SubtitlePath: `C:\sub.vtt`}, {SubtitleHash: "bad"}, {ConvertSubtitle: true}, {SubtitlePath: `C:\sub.srt`, SubtitleHash: "bad"}} {
		if (&ConversionOptions{Version: 1, Mux: s}).Validate("mkv") == nil {
			t.Fatal("invalid subtitle snapshot accepted", s)
		}
	}
}

func TestMuxOptions(t *testing.T) {
	for _, format := range []string{"mp4", "mkv", "mov", "ts"} {
		for _, audio := range []string{"", `C:\audio.m4a`} {
			o := &ConversionOptions{Version: 1, Mux: &MuxOptions{AudioPath: audio}}
			if err := o.Validate(format); err != nil {
				t.Fatal(err)
			}
		}
	}
	for _, mutate := range []func(*ConversionOptions){func(o *ConversionOptions) { o.MaxEdge = 720 }, func(o *ConversionOptions) { o.AudioBitrate = 192 }, func(o *ConversionOptions) { o.Trim = &TrimRange{EndMs: 1000} }, func(o *ConversionOptions) { o.Merge = &MergeSources{} }, func(o *ConversionOptions) { o.Capture = &CaptureRange{} }, func(o *ConversionOptions) { o.Compress = &CompressionOptions{} }, func(o *ConversionOptions) { o.Mux.AudioPath = "relative.m4a" }, func(o *ConversionOptions) { o.Mux.AudioPath = "C:\\bad\x00.wav" }} {
		o := &ConversionOptions{Version: 1, Mux: &MuxOptions{}}
		mutate(o)
		if o.Validate("mp4") == nil {
			t.Fatal("invalid mux accepted", o)
		}
	}
	if (&ConversionOptions{Version: 1, Mux: &MuxOptions{}}).Validate("webm") == nil {
		t.Fatal("unsupported container accepted")
	}
}
