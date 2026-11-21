package core

import "testing"

func TestCompressionTargetBudget(t *testing.T) {
	for _, row := range []struct {
		bytes, duration int64
		audio, want     int
	}{
		{100000000, 600000, 192, 1074666},
		{1000000, 8000, 192, 758000},
		{1000000, 8000, 0, 950000},
	} {
		got, err := CompressionTargetBitrate(row.bytes, row.duration, row.audio)
		if err != nil || got != row.want {
			t.Fatalf("%+v: %d, %v", row, got, err)
		}
	}
	for _, row := range []struct {
		bytes, duration int64
		audio           int
	}{
		{999999, 8000, 192}, {100000000001, 8000, 192}, {-1, 8000, 192},
		{1000000, 0, 192}, {1000000, 3600000, 192}, {100000000, 1, 192}, {1000000, 8000, -1},
	} {
		if _, err := CompressionTargetBitrate(row.bytes, row.duration, row.audio); err == nil {
			t.Fatalf("invalid budget accepted: %+v", row)
		}
	}
}

func TestCompressionTargetOptions(t *testing.T) {
	makeOptions := func() *ConversionOptions {
		return &ConversionOptions{Version: 1, Compress: &CompressionOptions{Codec: "hevc", TargetBytes: 1000000, Preset: "medium", Audio: "aac", Bitrate: 192}}
	}
	if err := makeOptions().Validate("mp4"); err != nil {
		t.Fatal(err)
	}
	for _, edit := range []func(*CompressionOptions){
		func(c *CompressionOptions) { c.CRF = 23 }, func(c *CompressionOptions) { c.TargetBytes = 999999 },
		func(c *CompressionOptions) { c.TargetBytes = 100000000001 }, func(c *CompressionOptions) { c.TargetBytes = -1 },
		func(c *CompressionOptions) { c.Audio = "copy"; c.Bitrate = 0 },
	} {
		o := makeOptions()
		edit(o.Compress)
		if o.Validate("mkv") == nil {
			t.Fatal("invalid target accepted")
		}
	}
}
