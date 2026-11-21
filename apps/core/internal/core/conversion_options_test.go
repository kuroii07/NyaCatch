package core

import (
	"path/filepath"
	"testing"
)

func TestMergeOptionsBoundsAndSafety(t *testing.T) {
	paths := []string{filepath.Join(t.TempDir(), "a.wav"), filepath.Join(t.TempDir(), "b.wav")}
	valid := func() *ConversionOptions {
		return &ConversionOptions{Version: 1, Merge: &MergeSources{Paths: append([]string(nil), paths...), Name: "成品"}}
	}
	if err := valid().Validate("wav"); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*ConversionOptions){
		func(o *ConversionOptions) { o.Merge.Paths = paths[:1] }, func(o *ConversionOptions) { o.Merge.Paths = make([]string, 21) },
		func(o *ConversionOptions) { o.Merge.Paths[0] = "relative.wav" }, func(o *ConversionOptions) { o.Merge.Name = "../escape" },
		func(o *ConversionOptions) { o.Merge.Name = "" }, func(o *ConversionOptions) { o.Trim = &TrimRange{EndMs: 1000} },
		func(o *ConversionOptions) { o.MaxEdge = 1920 }, func(o *ConversionOptions) { o.AudioBitrate = 128 },
	} {
		o := valid()
		mutate(o)
		if o.Validate("mp4") == nil {
			t.Fatal("invalid merge accepted")
		}
	}
	if valid().Validate("png") == nil || valid().Validate("webm") == nil {
		t.Fatal("unsupported merge format")
	}
}

func TestTrimNameSafety(t *testing.T) {
	for _, name := range []string{"", "片段 01", "scene.v2"} {
		if !ValidTrimName(name) {
			t.Fatalf("safe name rejected: %q", name)
		}
	}
	for _, name := range []string{"../outside", `C:\escape`, "bad:name", "a\x00b", "CON", "com1.mp4", "LPT²", "trail.", " leading"} {
		if (&ConversionOptions{Version: 1, Trim: &TrimRange{EndMs: 1000, Name: name}}).Validate("mp4") == nil {
			t.Fatalf("unsafe name accepted: %q", name)
		}
	}
}

func TestConversionOptionsRejectIncompatibleSettings(t *testing.T) {
	tests := []struct {
		name, format string
		options      *ConversionOptions
		valid        bool
	}{
		{"legacy", "mp4", nil, true}, {"default", "mp4", &ConversionOptions{Version: 1}, true},
		{"trim valid", "mp4", &ConversionOptions{Version: 1, Trim: &TrimRange{StartMs: 2250, EndMs: 3500}}, true},
		{"trim zero start", "wav", &ConversionOptions{Version: 1, Trim: &TrimRange{EndMs: 1000}}, true},
		{"trim negative", "mp4", &ConversionOptions{Version: 1, Trim: &TrimRange{StartMs: -1, EndMs: 1000}}, false},
		{"trim reversed", "mp4", &ConversionOptions{Version: 1, Trim: &TrimRange{StartMs: 2000, EndMs: 1000}}, false},
		{"trim empty", "mp4", &ConversionOptions{Version: 1, Trim: &TrimRange{}}, false},
		{"trim image", "png", &ConversionOptions{Version: 1, Trim: &TrimRange{EndMs: 1000}}, false},
		{"flv sizing", "flv", &ConversionOptions{Version: 1, MaxEdge: 1280}, true},
		{"ts sizing", "ts", &ConversionOptions{Version: 1, MaxEdge: 854}, true},
		{"avi sizing", "avi", &ConversionOptions{Version: 1, MaxEdge: 1920}, true},
		{"m4v 8k limit", "m4v", &ConversionOptions{Version: 1, MaxEdge: 7680}, true},
		{"version", "mp4", &ConversionOptions{Version: 2}, false}, {"relative directory", "mp4", &ConversionOptions{Version: 1, OutputDir: "relative"}, false},
		{"too small", "png", &ConversionOptions{Version: 1, MaxEdge: 1}, false}, {"too large", "mp4", &ConversionOptions{Version: 1, MaxEdge: 99999}, false},
		{"audio resize", "mp3", &ConversionOptions{Version: 1, MaxEdge: 512}, false}, {"lossless bitrate", "flac", &ConversionOptions{Version: 1, AudioBitrate: 192}, false},
		{"video bitrate", "mp4", &ConversionOptions{Version: 1, AudioBitrate: 192}, false}, {"invalid bitrate", "mp3", &ConversionOptions{Version: 1, AudioBitrate: 123}, false},
		{"ogg limit", "ogg", &ConversionOptions{Version: 1, AudioBitrate: 256}, false},
		{"opus limit", "opus", &ConversionOptions{Version: 1, AudioBitrate: 320}, false},
		{"ogg supported", "ogg", &ConversionOptions{Version: 1, AudioBitrate: 192}, true},
		{"opus supported", "opus", &ConversionOptions{Version: 1, AudioBitrate: 256}, true},
		{"image sizing", "webp", &ConversionOptions{Version: 1, MaxEdge: 512}, true}, {"audio bitrate", "mp3", &ConversionOptions{Version: 1, AudioBitrate: 192}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.options.Validate(tt.format); (err == nil) != tt.valid {
				t.Fatalf("valid=%v error=%v", tt.valid, err)
			}
		})
	}
}
