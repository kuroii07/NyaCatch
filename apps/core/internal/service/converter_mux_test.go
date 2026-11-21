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

func TestMuxCompatibility(t *testing.T) {
	source := MuxMedia{Path: `C:\a.mp4`, DurationMs: 4000, Streams: []MuxStream{{Type: "video", Codec: "h264"}, {Type: "audio", Codec: "aac"}}}
	for _, format := range []string{"mp4", "mkv", "mov", "ts"} {
		if muxCompatibility(source, nil, format) != "" {
			t.Fatal(format)
		}
	}
	source.Streams = append(source.Streams, MuxStream{Type: "subtitle", Codec: "ass"})
	if muxCompatibility(source, nil, "mp4") == "" || muxCompatibility(source, nil, "mkv") != "" {
		t.Fatal("subtitle compatibility")
	}
	audio := &MuxMedia{Path: `C:\a.wav`, Streams: []MuxStream{{Type: "audio", Codec: "pcm_s16le"}}}
	source.Streams = source.Streams[:2]
	if muxCompatibility(source, audio, "mp4") == "" || muxCompatibility(source, audio, "mov") != "" {
		t.Fatal("audio replacement compatibility")
	}
	audio.Streams = append(audio.Streams, audio.Streams[0])
	if muxCompatibility(source, audio, "mkv") != "mxSingleAudio" {
		t.Fatal("ambiguous audio accepted")
	}
	source.Streams = append(source.Streams, MuxStream{Type: "data", Codec: "bin_data"})
	if muxCompatibility(source, nil, "mkv") == "" {
		t.Fatal("unknown data dropped")
	}
}

func TestMuxRealPreservationAndReplacement(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	input := filepath.Join(dir, "视频 ' #.mp4")
	audio := filepath.Join(dir, "替换音频.m4a")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", input)
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "sine=frequency=880:duration=6", "-c:a", "aac", audio)
	original, _ := os.ReadFile(input)
	audioBefore, _ := os.ReadFile(audio)
	c := NewConverter(bin)
	videoPayload := func(file string) []byte {
		return fixtureCommand(t, bin, "-v", "error", "-i", file, "-map", "0:v:0", "-c", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "h264", "pipe:1")
	}
	id := int64(7800)
	for _, format := range []string{"mp4", "mkv", "mov", "ts"} {
		for _, external := range []string{"", audio} {
			id++
			o := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{AudioPath: external}}
			if err := c.prepareMux(input, format, o); err != nil {
				t.Fatal(err)
			}
			out, err := c.Start(id, input, format, "medium", nil, o)
			if err != nil {
				t.Fatal(format, external, err)
			}
			if format != "ts" && !bytes.Equal(videoPayload(input), videoPayload(out)) {
				t.Fatal("video packets changed", format)
			}
			// MPEG-TS requires Annex B framing and adds access-unit delimiters.
			// Decoded frame hashes, unlike container bytes, remain identical.
			frameHashes := func(file string) string {
				raw := fixtureCommand(t, bin, "-v", "error", "-i", file, "-map", "0:v:0", "-f", "framemd5", "pipe:1")
				var hashes []string
				for _, line := range strings.Split(string(raw), "\n") {
					if strings.HasPrefix(line, "#") || strings.TrimSpace(line) == "" {
						continue
					}
					fields := strings.Split(line, ",")
					hashes = append(hashes, strings.TrimSpace(fields[len(fields)-1]))
				}
				return strings.Join(hashes, "\n")
			}
			if frameHashes(input) != frameHashes(out) {
				t.Fatal("decoded video changed", format)
			}
			m, err := c.inspectMuxMedia(context.Background(), out)
			if err != nil || len(m.Streams) != 2 || m.DurationMs < 3900 || m.DurationMs > 4500 {
				t.Fatal(m, err)
			}
			// Complete decoder traversal; deterministic samples compare the actual replacement.
			fixtureCommand(t, bin, "-v", "error", "-i", out, "-fps_mode", "passthrough", "-enc_time_base", "1:1000", "-f", "null", "-")
			if external == "" {
				a := fixtureCommand(t, bin, "-v", "error", "-i", input, "-map", "0:a:0", "-c", "copy", "-f", "adts", "pipe:1")
				b := fixtureCommand(t, bin, "-v", "error", "-i", out, "-map", "0:a:0", "-c", "copy", "-f", "adts", "pipe:1")
				if !bytes.Equal(a, b) {
					t.Fatal("copied audio changed", format)
				}
			} else {
				decode := func(file string) []byte {
					return fixtureCommand(t, bin, "-v", "error", "-i", file, "-map", "0:a:0", "-ss", "1", "-t", "1", "-ar", "44100", "-f", "s16le", "pipe:1")
				}
				// Timestamp quantization differs across containers by one packet; dominant tone must match.
				samples := decode(out)
				crossings := 0
				for i := 2; i+1 < len(samples); i += 2 {
					a := int16(uint16(samples[i-2]) | uint16(samples[i-1])<<8)
					b := int16(uint16(samples[i]) | uint16(samples[i+1])<<8)
					if a <= 0 && b > 0 {
						crossings++
					}
				}
				if crossings < 860 || crossings > 900 {
					t.Fatal("wrong external audio", format, crossings)
				}
			}
		}
	}
	after, _ := os.ReadFile(input)
	afterAudio, _ := os.ReadFile(audio)
	if !bytes.Equal(original, after) || !bytes.Equal(audioBefore, afterAudio) {
		t.Fatal("source overwritten")
	}
	o := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{AudioPath: audio}}
	if err := c.prepareMux(input, "mp4", o); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(audio, append(audioBefore, ' '), 0600)
	if _, err := c.Start(7890, input, "mp4", "medium", nil, o); err == nil || !strings.Contains(err.Error(), "changed") {
		t.Fatal("changed audio accepted", err)
	}
}

func TestMuxSubtitlesShortAudioAndProtectedOutputs(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "source.mkv")
	sub := filepath.Join(dir, "sub.srt")
	audio := filepath.Join(dir, "short.m4a")
	os.WriteFile(sub, []byte(subtitleSRT), 0600)
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=4", "-i", sub, "-c:v", "libx264", "-threads", "1", "-c:s", "srt", source)
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "sine=duration=1", "-c:a", "aac", audio)
	c := NewConverter(bin)
	o := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{AudioPath: audio}}
	if err := c.prepareMux(source, "mp4", o); err == nil {
		t.Fatal("incompatible subtitles accepted")
	}
	if err := c.prepareMux(source, "mkv", o); err != nil {
		t.Fatal(err)
	}
	protected := filepath.Join(dir, "source-muxed.mkv")
	os.WriteFile(protected, []byte("existing output"), 0600)
	out, err := c.Start(7891, source, "mkv", "medium", nil, o)
	if err != nil {
		t.Fatal(err)
	}
	if out == protected {
		t.Fatal("overwrote output")
	}
	raw, _ := os.ReadFile(protected)
	if string(raw) != "existing output" {
		t.Fatal("existing file modified")
	}
	m, err := c.inspectMuxMedia(context.Background(), out)
	if err != nil || m.DurationMs < 3900 || len(m.Streams) != 3 {
		t.Fatal(m, err)
	}
	text := fixtureCommand(t, bin, "-v", "error", "-i", out, "-map", "0:s:0", "-c", "copy", "-f", "srt", "pipe:1")
	if !bytes.Contains(text, []byte("HELLO")) {
		t.Fatal("subtitles lost")
	}
	for _, entry := range mustMuxDir(t, dir) {
		if strings.HasPrefix(entry.Name(), ".nyacatch-mux-") {
			t.Fatal("temporary output leaked")
		}
	}
}
func mustMuxDir(t *testing.T, dir string) []os.DirEntry {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	return entries
}

func TestMuxChaptersAllAudioAndAttachments(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "chapter-source.mkv")
	meta := filepath.Join(dir, "metadata.txt")
	os.WriteFile(meta, []byte(";FFMETADATA1\ntitle=chapter test\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=2000\ntitle=first\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=2000\nEND=4000\ntitle=second\n"), 0600)
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=4", "-f", "lavfi", "-i", "sine=duration=4:frequency=440", "-f", "lavfi", "-i", "sine=duration=4:frequency=880", "-f", "ffmetadata", "-i", meta, "-map", "0:v", "-map", "1:a", "-map", "2:a", "-map_metadata", "3", "-map_chapters", "3", "-metadata:s:a:0", "language=zho", "-metadata:s:a:1", "language=jpn", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", source)
	c := NewConverter(bin)
	for i, format := range []string{"mkv", "mp4", "mov"} {
		o := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{}}
		if err := c.prepareMux(source, format, o); err != nil {
			t.Fatal(err)
		}
		out, err := c.Start(int64(7900+i), source, format, "medium", nil, o)
		if err != nil {
			t.Fatal(format, err)
		}
		m, err := c.inspectMuxMedia(context.Background(), out)
		if err != nil || m.Chapters != 2 || len(muxTracks(m, nil)) != 3 {
			t.Fatal(m, err)
		}
		// MP4's chapter data track must be recognized on the next round trip too.
		if format == "mp4" {
			again := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{}}
			if err := c.prepareMux(out, "mkv", again); err != nil {
				t.Fatal(err)
			}
			if _, err := c.Start(7910, out, "mkv", "medium", nil, again); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := c.prepareMux(source, "ts", &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{}}); err == nil {
		t.Fatal("TS chapters silently dropped")
	}
	attachment := filepath.Join(dir, "notes.txt")
	os.WriteFile(attachment, []byte("keep attachment bytes"), 0600)
	attached := filepath.Join(dir, "attached.mkv")
	fixtureCommand(t, bin, "-v", "error", "-i", source, "-map", "0", "-c", "copy", "-attach", attachment, "-metadata:s:t:0", "mimetype=text/plain", attached)
	o := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{}}
	if err := c.prepareMux(attached, "mkv", o); err != nil {
		t.Fatal(err)
	}
	out, err := c.Start(7911, attached, "mkv", "medium", nil, o)
	if err != nil {
		t.Fatal(err)
	}
	payload := filepath.Join(dir, "attachment-out.txt")
	fixtureCommand(t, bin, "-v", "error", "-dump_attachment:t:0", payload, "-i", out, "-map", "0:v:0", "-c", "copy", "-f", "null", "-")
	raw, _ := os.ReadFile(payload)
	if string(raw) != "keep attachment bytes" {
		t.Fatal("attachment lost")
	}
}

func TestMuxCancellationAndOccupiedSlots(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "cancel.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=24:d=4", "-c:v", "libx264", "-threads", "1", source)
	c := NewConverter(bin)
	o := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{}}
	if err := c.prepareMux(source, "mkv", o); err != nil {
		t.Fatal(err)
	}
	stopped := false
	out, err := c.Start(7920, source, "mkv", "medium", func(int) {
		if !stopped {
			stopped = c.Stop(7920)
		}
	}, o)
	if !stopped || err == nil || out != "" {
		t.Fatal(stopped, out, err)
	}
	for _, entry := range mustMuxDir(t, dir) {
		if strings.HasPrefix(entry.Name(), ".nyacatch-mux-") {
			t.Fatal("cancelled workspace leaked")
		}
	}
	if _, err = c.Start(7920, source, "mkv", "medium", nil, o); err != nil {
		t.Fatal("retry failed", err)
	}
	c.slots <- struct{}{}
	c.slots <- struct{}{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	svc := &ConversionService{converter: c}
	if _, err := svc.InspectMux(ctx, source, ""); err == nil {
		t.Fatal("blocked inspection ignored cancellation")
	}
	<-c.slots
	<-c.slots
}
