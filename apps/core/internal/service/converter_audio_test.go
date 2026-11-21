package service

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"caorushizi.cn/mediago/internal/core"
)

func TestOriginalAudioRealCopyAndProtection(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	c := NewConverter(bin)
	cases := []struct{ codec, encoder, extension string }{
		{"aac", "aac", "m4a"}, {"alac", "alac", "m4a"}, {"mp3", "libmp3lame", "mp3"},
		{"flac", "flac", "flac"}, {"opus", "libopus", "opus"}, {"vorbis", "libvorbis", "ogg"},
		{"pcm_s16le", "pcm_s16le", "wav"}, {"pcm_s24le", "pcm_s24le", "wav"}, {"pcm_f32le", "pcm_f32le", "wav"},
		{"ac3", "ac3", "ac3"}, {"eac3", "eac3", "eac3"}, {"mp2", "mp2", "mp2"},
	}
	for i, tc := range cases {
		t.Run(tc.codec, func(t *testing.T) {
			// Use each codec in its standard source container. Video inputs follow below.
			input := filepath.Join(dir, "素材 ' # "+tc.codec+"."+tc.extension)
			fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1.2", "-c:a", tc.encoder, "-threads", "1", input)
			original, _ := os.ReadFile(input)
			source, err := c.inspectAudioSource(context.Background(), input)
			if err != nil {
				t.Fatal(err)
			}
			existing := filepath.Join(dir, strings.TrimSuffix(filepath.Base(input), "."+tc.extension)+"-audio."+tc.extension)
			os.WriteFile(existing, []byte("keep"), 0600)
			output, err := c.Start(int64(7000+i), input, "original", "medium", nil)
			if err != nil {
				t.Fatal(err)
			}
			actual, err := c.inspectAudioSource(context.Background(), output)
			if err != nil {
				t.Fatal(err)
			}
			if actual.Codec != tc.codec || actual.Rate != source.Rate || actual.Channels != source.Channels || filepath.Ext(output) != "."+tc.extension {
				t.Fatalf("bad extraction: %+v", actual)
			}
			payload := func(file string) []byte {
				return fixtureCommand(t, bin, "-v", "error", "-i", file, "-map", "0:a:0", "-c:a", "copy", "-f", "streamhash", "-hash", "sha256", "pipe:1")
			}
			if !bytes.Equal(payload(input), payload(output)) {
				t.Fatalf("encoded audio payload changed: %s -> %s", payload(input), payload(output))
			}
			if got, _ := os.ReadFile(input); !bytes.Equal(got, original) {
				t.Fatal("source changed")
			}
			if got, _ := os.ReadFile(existing); string(got) != "keep" {
				t.Fatal("collision changed")
			}
			if output == existing {
				t.Fatal("existing file overwritten")
			}
		})
	}
	silent := filepath.Join(dir, "silent.mp4")
	for i, extension := range []string{"mp4", "ts"} {
		input := filepath.Join(dir, "movie."+extension)
		fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "color=blue:s=64x48:r=10:d=2", "-f", "lavfi", "-i", "sine=frequency=660:duration=2", "-c:v", "libx264", "-c:a", "aac", "-threads", "1", input)
		out, err := c.Start(int64(7200+i), input, "original", "medium", nil)
		if err != nil {
			t.Fatal(extension, err)
		}
		pcm := func(file string) []byte {
			return fixtureCommand(t, bin, "-v", "error", "-i", file, "-map", "0:a:0", "-f", "s16le", "pipe:1")
		}
		if !bytes.Equal(pcm(input), pcm(out)) {
			t.Fatal(extension, "decoded samples changed")
		}
	}
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "color=red:s=64x48:r=10:d=0.3", "-c:v", "libx264", "-threads", "1", silent)
	if _, err := c.Start(7100, silent, "original", "medium", nil); err == nil {
		t.Fatal("silent source accepted")
	}
	// Two tracks with a louder/default second track still extract the first one.
	multi := filepath.Join(dir, "two.mkv")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-f", "lavfi", "-i", "sine=frequency=880:duration=3", "-map", "0:a", "-map", "1:a", "-c:a", "flac", "-disposition:a:0", "0", "-disposition:a:1", "default", multi)
	out, err := c.Start(7101, multi, "original", "medium", nil)
	if err != nil {
		t.Fatal(err)
	}
	hash := func(file string) []byte {
		return fixtureCommand(t, bin, "-v", "error", "-i", file, "-map", "0:a:0", "-c:a", "copy", "-f", "streamhash", "-hash", "sha256", "pipe:1")
	}
	if !bytes.Equal(hash(multi), hash(out)) {
		t.Fatal("wrong audio track extracted")
	}
	if _, err := c.Start(7333, multi, "original", "medium", func(int) { c.Stop(7333) }); err == nil {
		t.Fatal("canceled extraction completed")
	}
	if _, err := c.Start(7333, multi, "original", "medium", nil); err != nil {
		t.Fatal("retry", err)
	}
	for _, e := range mustReadDir(t, dir) {
		if strings.HasPrefix(e.Name(), ".nyacatch-audio-") {
			t.Fatal("temporary output leaked")
		}
	}
}
func mustReadDir(t *testing.T, dir string) []os.DirEntry {
	t.Helper()
	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	return files
}
func TestOriginalAudioOptions(t *testing.T) {
	for _, options := range []*core.ConversionOptions{
		{Version: 1, MaxEdge: 1080}, {Version: 1, AudioBitrate: 192}, {Version: 1, Trim: &core.TrimRange{StartMs: 0, EndMs: 1}},
		{Version: 1, Merge: &core.MergeSources{Paths: []string{"a", "b"}, Name: "join"}},
	} {
		if options.Validate("original") == nil {
			t.Fatal("incompatible original-audio options accepted")
		}
	}
	if err := (&core.ConversionOptions{Version: 1}).Validate("original"); err != nil {
		t.Fatal(err)
	}
	if audioCopyExtension("unknown") != "" {
		t.Fatal("unknown codec silently copied")
	}
}
