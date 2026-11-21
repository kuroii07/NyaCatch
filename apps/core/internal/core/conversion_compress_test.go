package core

import "testing"

func TestCompressionEncoderOptions(t *testing.T) {
	for _, encoder := range []string{"", "cpu", "nvenc"} {
		for _, codec := range []string{"h264", "hevc"} {
			cq := 23
			o := &ConversionOptions{Version: 1, Compress: &CompressionOptions{Encoder: encoder, Codec: codec, CRF: 23, Preset: "medium", Audio: "aac", Bitrate: 192}}
			if encoder == "nvenc" {
				o.Compress.CRF = 0
				o.Compress.CQ = &cq
			}
			if err := o.Validate("mp4"); err != nil {
				t.Fatal(err)
			}
		}
	}
	for _, mutate := range []func(*CompressionOptions){
		func(o *CompressionOptions) { o.Encoder = "amf" },
		func(o *CompressionOptions) { o.CQ = nil },
		func(o *CompressionOptions) { n := 0; o.CQ = &n },
		func(o *CompressionOptions) { n := 52; o.CQ = &n },
		func(o *CompressionOptions) { o.CRF = 23 },
		func(o *CompressionOptions) { o.TargetBytes = 1000000 },
		func(o *CompressionOptions) { o.Encoder = "cpu" },
	} {
		cq := 23
		o := &ConversionOptions{Version: 1, Compress: &CompressionOptions{Encoder: "nvenc", Codec: "h264", CQ: &cq, Preset: "medium", Audio: "aac", Bitrate: 192}}
		mutate(o.Compress)
		if o.Validate("mp4") == nil {
			t.Fatal("invalid hardware options accepted", o.Compress)
		}
	}
}

func TestCompressionOptions(t *testing.T) {
	good := func() *ConversionOptions {
		return &ConversionOptions{Version: 1, Compress: &CompressionOptions{Codec: "h264", CRF: 23, Preset: "medium", Audio: "aac", Bitrate: 192}}
	}
	for _, format := range []string{"mp4", "mkv"} {
		if err := good().Validate(format); err != nil {
			t.Fatal(err)
		}
	}
	for _, change := range []func(*ConversionOptions){
		func(o *ConversionOptions) { o.Compress.CRF = -1 }, func(o *ConversionOptions) { o.Compress.CRF = 52 }, func(o *ConversionOptions) { o.Compress.Codec = "unknown" }, func(o *ConversionOptions) { o.Compress.Preset = ";cmd" }, func(o *ConversionOptions) { o.Compress.Audio = "unknown" }, func(o *ConversionOptions) { o.Compress.Audio = "copy" }, func(o *ConversionOptions) { o.Compress.Bitrate = 999 }, func(o *ConversionOptions) { o.Compress.FPS = 120 }, func(o *ConversionOptions) { o.Compress.Trial = &TrimRange{EndMs: 31000} }, func(o *ConversionOptions) { o.Compress.Trial = &TrimRange{StartMs: 1000, EndMs: 0} }, func(o *ConversionOptions) { o.Trim = &TrimRange{EndMs: 1000} }, func(o *ConversionOptions) { o.Capture = &CaptureRange{} }, func(o *ConversionOptions) { o.Merge = &MergeSources{} }, func(o *ConversionOptions) { o.AudioBitrate = 192 }, func(o *ConversionOptions) { o.MaxEdge = 9000 },
	} {
		o := good()
		change(o)
		if o.Validate("mp4") == nil {
			t.Fatal("invalid compression accepted")
		}
	}
	if good().Validate("webm") == nil {
		t.Fatal("unsupported container accepted")
	}
	for _, codec := range []string{"h264", "hevc"} {
		for _, fps := range []int{0, 24, 25, 30, 50, 60} {
			o := good()
			o.Compress.Codec = codec
			o.Compress.FPS = fps
			o.Compress.Audio = "copy"
			o.Compress.Bitrate = 0
			o.Compress.Trial = &TrimRange{StartMs: 2000, EndMs: 3000}
			if err := o.Validate("mkv"); err != nil {
				t.Fatal(err)
			}
		}
	}
}
