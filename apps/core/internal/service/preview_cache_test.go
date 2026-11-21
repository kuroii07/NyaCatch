package service

import (
	"context"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func awaitPreview(t *testing.T, p *PreviewCache, id string) PreviewState {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		v, err := p.Get(id)
		if err != nil {
			t.Fatal(err)
		}
		if v.Status == "ready" || v.Status == "failed" || v.Status == "cancelled" {
			return v
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("preview timeout")
	return PreviewState{}
}
func TestPreviewCacheRealMediaAndLeases(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "源 ' #.mkv")
	audio := filepath.Join(dir, "音频.flac")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-threads", "1", "-c:a", "pcm_s16le", source)
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "sine=duration=3", "-c:a", "flac", audio)
	original, _ := os.ReadFile(source)
	c := NewConverter(bin)
	p := NewPreviewCache(filepath.Join(dir, "preview-cache"), c)
	first, err := p.Start(source)
	if err != nil {
		t.Fatal(err)
	}
	second, err := p.Start(source)
	if err != nil {
		t.Fatal(err)
	}
	p.Release(first.ID)
	v := awaitPreview(t, p, second.ID)
	if v.Status != "ready" || v.Cached || !strings.HasSuffix(v.Path, ".mp4") {
		t.Fatal(v)
	}
	media, err := c.inspectMergeSource(context.Background(), v.Path)
	if err != nil || media.videoCodec != "h264" || media.audioCodec != "aac" || media.width != 320 || media.height != 180 {
		t.Fatal(media, err)
	}
	info, err := p.Clear()
	if err != nil || info.Files != 1 {
		t.Fatal("live lease must protect cache", info, err)
	}
	p.Release(second.ID)
	again, err := p.Start(source)
	if err != nil || !again.Cached || again.Status != "ready" {
		t.Fatal(again, err)
	}
	p.Release(again.ID)
	// A fresh cache object models an application restart; disk cache remains usable.
	restored := NewPreviewCache(p.root, c)
	reused, err := restored.Start(source)
	if err != nil || !reused.Cached {
		t.Fatal(reused, err)
	}
	restored.Release(reused.ID)
	a, err := p.Start(audio)
	if err != nil {
		t.Fatal(err)
	}
	a = awaitPreview(t, p, a.ID)
	if a.Status != "ready" || !strings.HasSuffix(a.Path, ".m4a") {
		t.Fatal(a)
	}
	p.Release(a.ID)
	if info, err = p.Clear(); err != nil || info.Files != 0 || info.Bytes != 0 {
		t.Fatal(info, err)
	}
	after, _ := os.ReadFile(source)
	if string(original) != string(after) {
		t.Fatal("source modified")
	}
}
func TestPreviewQueuedCancelAndSourceChange(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "source.ts")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=3", "-c:v", "libx264", "-threads", "1", source)
	c := NewConverter(bin)
	p := NewPreviewCache(filepath.Join(dir, "cache"), c)
	c.slots <- struct{}{}
	c.slots <- struct{}{}
	v, err := p.Start(source)
	if err != nil {
		t.Fatal(err)
	}
	if v.Status != "queued" {
		t.Fatal(v)
	}
	p.Release(v.ID)
	if _, err = p.Get(v.ID); err == nil {
		t.Fatal("released lease survived")
	}
	<-c.slots
	<-c.slots
	v, err = p.Start(source)
	if err != nil {
		t.Fatal(err)
	}
	v = awaitPreview(t, p, v.ID)
	if v.Status != "ready" {
		t.Fatal(v)
	}
	p.Release(v.ID)
	info, _ := os.Stat(source)
	os.Chtimes(source, time.Now(), info.ModTime().Add(time.Second))
	v, err = p.Start(source)
	if err != nil || v.Cached {
		t.Fatal("changed source reused stale proxy", v, err)
	}
	v = awaitPreview(t, p, v.ID)
	if v.Status != "ready" {
		t.Fatal(v)
	}
	p.Release(v.ID)
	for _, name := range mustMuxDir(t, p.root) {
		if strings.HasPrefix(name.Name(), ".preview-") {
			t.Fatal("temporary preview leaked")
		}
	}
}
func TestPreviewRejectsInvalidSourcesAndPreservesUnknownFiles(t *testing.T) {
	p := NewPreviewCache(filepath.Join(t.TempDir(), "cache"), NewConverter("unused"))
	for _, name := range []string{"relative.mp4", filepath.Join(t.TempDir(), "missing.mp4")} {
		if _, err := p.Start(name); err == nil {
			t.Fatal(name)
		}
	}
	if err := p.ensureRoot(); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(p.root, "keep-user-file.txt")
	os.WriteFile(file, []byte("keep"), 0600)
	if _, err := p.Clear(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatal("unknown cache file deleted")
	}
	if _, err := p.Get("unknown"); err == nil {
		t.Fatal("unknown request accepted")
	}
	p.Release("unknown")
}

func TestPreviewVFRRotationAndAudioTiming(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	base := filepath.Join(dir, "base.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=4", "-f", "lavfi", "-i", "sine=duration=4", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", base)
	vfr := filepath.Join(dir, "vfr.mkv")
	fixtureCommand(t, bin, "-v", "error", "-i", base, "-vf", "select='if(lt(t,2),not(mod(n,2)),1)'", "-fps_mode:v", "vfr", "-c:v", "libx264", "-threads", "1", "-c:a", "copy", vfr)
	rotated := filepath.Join(dir, "rotated.mov")
	fixtureCommand(t, bin, "-v", "error", "-i", base, "-c", "copy", "-metadata:s:v:0", "rotate=90", rotated)
	flv := filepath.Join(dir, "source.flv")
	fixtureCommand(t, bin, "-v", "error", "-i", base, "-c", "copy", flv)
	sar := filepath.Join(dir, "sar.mkv")
	fixtureCommand(t, bin, "-v", "error", "-i", base, "-vf", "setsar=2", "-c:v", "libx264", "-threads", "1", "-c:a", "copy", sar)
	p := NewPreviewCache(filepath.Join(dir, "cache"), NewConverter(bin))
	for _, input := range []string{vfr, rotated, flv, sar} {
		v, err := p.Start(input)
		if err != nil {
			t.Fatal(err)
		}
		v = awaitPreview(t, p, v.ID)
		if v.Status != "ready" {
			t.Fatal(input, v)
		}
		expected := 3
		actual := fixtureCommand(t, bin, "-v", "error", "-ss", "1.250", "-i", v.Path, "-frames:v", "1", "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1")
		if len(actual) != expected {
			t.Fatal("cannot seek preview", input, len(actual))
		}
		original := fixtureCommand(t, bin, "-v", "error", "-ss", "1.250", "-i", input, "-frames:v", "1", "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1")
		for i, x := range actual {
			delta := int(x) - int(original[i])
			if delta < -8 || delta > 8 {
				t.Fatal("preview seek no longer corresponds to original", input, actual, original)
			}
		}
		if input == rotated {
			m, _ := p.converter.inspectMergeSource(context.Background(), v.Path)
			if m.width != 180 || m.height != 320 {
				t.Fatal("rotation lost", m)
			}
		}
		if input == sar {
			m, _ := p.converter.inspectMergeSource(context.Background(), v.Path)
			if m.width != 640 || m.height != 180 {
				t.Fatal("display aspect lost", m)
			}
		}
		if input == vfr {
			times := func(file string) string {
				return string(fixtureCommand(t, filepath.Join(filepath.Dir(bin), "ffprobe"+filepath.Ext(bin)), "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=best_effort_timestamp_time", "-of", "csv=p=0", file))
			}
			a, b := strings.Fields(strings.ReplaceAll(times(input), ",", "")), strings.Fields(strings.ReplaceAll(times(v.Path), ",", ""))
			if len(a) != len(b) {
				t.Fatal("VFR frames changed", len(a), len(b))
			}
			for i := range a {
				x, _ := strconv.ParseFloat(a[i], 64)
				y, _ := strconv.ParseFloat(b[i], 64)
				if math.Abs(x-y) > .003 {
					t.Fatal("VFR timeline changed", i, x, y)
				}
			}
		}
		p.Release(v.ID)
	}
}

func TestPreviewCacheCrashCleanupAndCorruptEntry(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	cache := filepath.Join(dir, "cache")
	owned := filepath.Join(cache, ".preview-crashed")
	unknown := filepath.Join(cache, ".preview-user-folder")
	os.MkdirAll(owned, 0700)
	os.MkdirAll(unknown, 0700)
	os.WriteFile(filepath.Join(owned, ".nyacatch-preview.json"), []byte(`{"Version":1,"Key":"`+strings.Repeat("a", 64)+`"}`), 0600)
	os.WriteFile(filepath.Join(owned, "partial.mp4"), []byte("partial"), 0600)
	os.WriteFile(filepath.Join(unknown, "keep"), []byte("keep"), 0600)
	p := NewPreviewCache(cache, NewConverter(bin))
	if _, err := p.Info(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(owned); !os.IsNotExist(err) {
		t.Fatal("owned orphan not cleaned", err)
	}
	if _, err := os.Stat(unknown); err != nil {
		t.Fatal("unknown directory removed", err)
	}
	source := filepath.Join(dir, "source.mp4")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=96x64:r=12:d=2", "-c:v", "libx264", "-threads", "1", source)
	v, err := p.Start(source)
	if err != nil {
		t.Fatal(err)
	}
	v = awaitPreview(t, p, v.ID)
	if v.Status != "ready" {
		t.Fatal(v)
	}
	p.Release(v.ID)
	f, err := os.OpenFile(v.Path, os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString("changed")
	f.Close()
	v, err = p.Start(source)
	if err != nil || v.Cached {
		t.Fatal(v, err)
	}
	v = awaitPreview(t, p, v.ID)
	if v.Status != "ready" {
		t.Fatal(v)
	}
	p.Release(v.ID)
}

func TestPreviewAudioOffsetAndHDRRefusal(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	video := filepath.Join(dir, "silent.mp4")
	audio := filepath.Join(dir, "audio.wav")
	offset := filepath.Join(dir, "offset.mkv")
	hdr := filepath.Join(dir, "hdr.mkv")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=96x64:r=24:d=4", "-c:v", "libx264", "-threads", "1", video)
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "sine=duration=3", "-c:a", "pcm_s16le", audio)
	fixtureCommand(t, bin, "-v", "error", "-i", video, "-itsoffset", "0.5", "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", offset)
	fixtureCommand(t, bin, "-v", "error", "-i", video, "-c:v", "libx264", "-threads", "1", "-color_trc", "smpte2084", hdr)
	p := NewPreviewCache(filepath.Join(dir, "cache"), NewConverter(bin))
	v, err := p.Start(offset)
	if err != nil {
		t.Fatal(err)
	}
	v = awaitPreview(t, p, v.ID)
	if v.Status != "ready" {
		t.Fatal(v)
	}
	getStart := func(file string) float64 {
		raw := fixtureCommand(t, filepath.Join(filepath.Dir(bin), "ffprobe"+filepath.Ext(bin)), "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=start_time", "-of", "csv=p=0", file)
		seconds, _ := strconv.ParseFloat(strings.TrimSpace(string(raw)), 64)
		return seconds
	}
	if delta := math.Abs(getStart(offset) - getStart(v.Path)); delta > .05 {
		t.Fatal("audio offset changed", getStart(offset), getStart(v.Path))
	}
	p.Release(v.ID)
	h, err := p.Start(hdr)
	if err != nil {
		t.Fatal(err)
	}
	h = awaitPreview(t, p, h.ID)
	if h.Status != "failed" || h.Error != "pcHDR" {
		t.Fatal("HDR preview should fail explicitly", h)
	}
	p.Release(h.ID)
}
