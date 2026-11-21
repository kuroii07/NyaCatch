package core

import "testing"

func TestCaptureBoundsAndIncompatibleOptions(t *testing.T) {
	valid := func() *ConversionOptions {
		return &ConversionOptions{Version: 1, MaxEdge: 480, Capture: &CaptureRange{StartMs: 1000, EndMs: 3000, FPS: 10, Loop: true}}
	}
	if err := valid().Validate("gif"); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*ConversionOptions){
		func(o *ConversionOptions) { o.Capture.StartMs = -1 }, func(o *ConversionOptions) { o.Capture.EndMs = 1000 }, func(o *ConversionOptions) { o.Capture.EndMs = 32000 },
		func(o *ConversionOptions) { o.Capture.FPS = 60 }, func(o *ConversionOptions) { o.MaxEdge = -1 }, func(o *ConversionOptions) { o.MaxEdge = 961 }, func(o *ConversionOptions) { o.Capture.Name = "../escape" },
		func(o *ConversionOptions) { o.Trim = &TrimRange{EndMs: 1000} }, func(o *ConversionOptions) { o.Merge = &MergeSources{} }, func(o *ConversionOptions) { o.AudioBitrate = 128 },
	} {
		o := valid()
		mutate(o)
		if o.Validate("gif") == nil {
			t.Fatal("invalid capture accepted")
		}
	}
	for _, o := range []*ConversionOptions{nil, {Version: 1}} {
		if o.Validate("gif") == nil {
			t.Fatal("GIF without bounded capture accepted")
		}
	}
	for _, format := range []string{"png", "jpg", "webp"} {
		o := &ConversionOptions{Version: 1, Capture: &CaptureRange{StartMs: 0}}
		if err := o.Validate(format); err != nil {
			t.Fatal(err)
		}
		o.Capture.EndMs = 100
		if o.Validate(format) == nil {
			t.Fatal("range in still capture accepted")
		}
	}
	if valid().Validate("mp4") == nil {
		t.Fatal("capture exported as normal video")
	}
	for _, fps := range []int{0, 5, 6, 10, 12, 15, 24} {
		for _, edge := range []int{0, 160, 240, 320, 360, 480, 640, 720, 960} {
			o := valid()
			o.Capture.FPS = fps
			o.MaxEdge = edge
			if err := o.Validate("gif"); err != nil {
				t.Fatalf("fps=%d edge=%d: %v", fps, edge, err)
			}
		}
	}
}
