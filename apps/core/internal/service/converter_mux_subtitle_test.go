package service

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"caorushizi.cn/mediago/internal/core"
	"golang.org/x/text/encoding/simplifiedchinese"
	textunicode "golang.org/x/text/encoding/unicode"
)

func TestMuxExternalSubtitleCodecPolicy(t *testing.T) {
	for _, tc := range []struct {
		format, sub   string
		convert       bool
		codec, reason string
	}{
		{"mkv", "srt", false, "subrip", ""}, {"mkv", "ass", false, "ass", ""}, {"mp4", "srt", false, "", "mxSubtitleConvertRequired"}, {"mov", "srt", true, "mov_text", ""}, {"mp4", "ass", true, "", "mxSubtitleMKV"}, {"ts", "srt", true, "", "mxSubtitleMKV"},
	} {
		codec, reason := muxSubtitleCodec(tc.format, tc.sub, tc.convert)
		if codec != tc.codec || reason != tc.reason {
			t.Fatal(tc, codec, reason)
		}
	}
}
func muxFrameHashes(t *testing.T, bin, file string) string {
	raw := fixtureCommand(t, bin, "-v", "error", "-i", file, "-map", "0:v:0", "-f", "framemd5", "pipe:1")
	var hashes []string
	for _, line := range strings.Split(string(raw), "\n") {
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Split(line, ",")
		hashes = append(hashes, strings.TrimSpace(fields[len(fields)-1]))
	}
	return strings.Join(hashes, "\n")
}
func TestMuxExternalSubtitleRealTracks(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	silent := filepath.Join(dir, "无声 ' #.mp4")
	voiced := filepath.Join(dir, "原音轨.mp4")
	audio := filepath.Join(dir, "外部.m4a")
	srt := filepath.Join(dir, "字幕 [测试].srt")
	ass := filepath.Join(dir, "样式.ass")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=4", "-c:v", "libx264", "-threads", "1", silent)
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "sine=frequency=880:duration=4", "-c:a", "aac", audio)
	fixtureCommand(t, bin, "-v", "error", "-i", silent, "-i", audio, "-c", "copy", voiced)
	os.WriteFile(srt, []byte(subtitleSRT), 0600)
	os.WriteFile(ass, []byte(subtitleASS), 0600)
	c := NewConverter(bin)
	id := int64(7950)
	original, _ := os.ReadFile(silent)
	srtBefore, _ := os.ReadFile(srt)
	assBefore, _ := os.ReadFile(ass)
	for _, source := range []string{silent, voiced} {
		for _, external := range []string{"", audio} {
			for _, sub := range []string{srt, ass} {
				id++
				o := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{AudioPath: external, SubtitlePath: sub}}
				if err := c.prepareMux(source, "mkv", o); err != nil {
					t.Fatal(err)
				}
				if len(o.Mux.SubtitleHash) != 64 {
					t.Fatal("subtitle snapshot absent")
				}
				out, err := c.Start(id, source, "mkv", "medium", nil, o)
				if err != nil {
					t.Fatal(source, external, sub, err)
				}
				if muxFrameHashes(t, bin, source) != muxFrameHashes(t, bin, out) {
					t.Fatal("subtitle was burned in or video changed")
				}
				m, err := c.inspectMuxMedia(context.Background(), out)
				if err != nil {
					t.Fatal(err)
				}
				audios, subs := 0, 0
				for _, s := range m.Streams {
					if s.Type == "audio" {
						audios++
					}
					if s.Type == "subtitle" {
						subs++
						expected := "subrip"
						if sub == ass {
							expected = "ass"
						}
						if s.Codec != expected {
							t.Fatal(s)
						}
					}
				}
				expectedAudio := 0
				if source == voiced || external != "" {
					expectedAudio = 1
				}
				if audios != expectedAudio || subs != 1 {
					t.Fatal(m)
				}
				text := fixtureCommand(t, bin, "-v", "error", "-i", out, "-map", "0:s:0", "-c", "copy", "-f", strings.TrimPrefix(filepath.Ext(sub), "."), "pipe:1")
				if sub == srt && !bytes.Contains(text, []byte("字幕测试 HELLO")) {
					t.Fatal(string(text))
				}
				styleLine := ""
				for _, line := range strings.Split(subtitleASS, "\n") {
					if strings.HasPrefix(line, "Style:") {
						styleLine = line
					}
				}
				if sub == ass && (!bytes.Contains(text, []byte("ORIGINAL STYLE")) || !bytes.Contains(text, []byte(styleLine))) {
					t.Fatal("ASS style lost", string(text))
				}
				if expectedAudio == 1 {
					inputAudio := audio
					if external == "" {
						inputAudio = source
					}
					payload := func(p string) []byte {
						return fixtureCommand(t, bin, "-v", "error", "-i", p, "-map", "0:a:0", "-c", "copy", "-f", "adts", "pipe:1")
					}
					if !bytes.Equal(payload(inputAudio), payload(out)) {
						t.Fatal("audio changed")
					}
				}
			}
		}
	}
	for _, format := range []string{"mp4", "mov"} {
		o := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{SubtitlePath: srt}}
		if err := c.prepareMux(silent, format, o); err == nil {
			t.Fatal("implicit subtitle conversion accepted")
		}
		o.Mux.ConvertSubtitle = true
		if err := c.prepareMux(silent, format, o); err != nil {
			t.Fatal(err)
		}
		id++
		out, err := c.Start(id, silent, format, "medium", nil, o)
		if err != nil {
			t.Fatal(err)
		}
		text := fixtureCommand(t, bin, "-v", "error", "-i", out, "-map", "0:s:0", "-c", "srt", "-f", "srt", "pipe:1")
		if !bytes.Contains(text, []byte("字幕测试 HELLO")) {
			t.Fatal(string(text))
		}
		if muxFrameHashes(t, bin, silent) != muxFrameHashes(t, bin, out) {
			t.Fatal("MP4 video changed")
		}
	}
	after, _ := os.ReadFile(silent)
	afterSRT, _ := os.ReadFile(srt)
	afterASS, _ := os.ReadFile(ass)
	if !bytes.Equal(original, after) || !bytes.Equal(srtBefore, afterSRT) || !bytes.Equal(assBefore, afterASS) {
		t.Fatal("source modified")
	}
}
func TestMuxExternalSubtitleEncodingChangeAndRetry(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "source.mp4")
	sub := filepath.Join(dir, "字幕.srt")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=4", "-c:v", "libx264", "-threads", "1", source)
	gbk, _ := simplifiedchinese.GB18030.NewEncoder().Bytes([]byte(subtitleSRT))
	utf16, _ := textunicode.UTF16(textunicode.BigEndian, textunicode.UseBOM).NewEncoder().Bytes([]byte(subtitleSRT))
	c := NewConverter(bin)
	for i, raw := range [][]byte{gbk, utf16} {
		os.WriteFile(sub, raw, 0600)
		o := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{SubtitlePath: sub}}
		if err := c.prepareMux(source, "mkv", o); err != nil {
			t.Fatal(err)
		}
		out, err := c.Start(int64(7990+i), source, "mkv", "medium", nil, o)
		if err != nil {
			t.Fatal(err)
		}
		text := fixtureCommand(t, bin, "-v", "error", "-i", out, "-map", "0:s:0", "-c", "copy", "-f", "srt", "pipe:1")
		if !bytes.Contains(text, []byte("字幕测试 HELLO")) {
			t.Fatal("non UTF8 subtitle lost", string(text))
		}
	}
	os.WriteFile(sub, []byte(subtitleSRT), 0600)
	o := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{SubtitlePath: sub}}
	if err := c.prepareMux(source, "mkv", o); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(sub, []byte(subtitleSRT+"\n"), 0600)
	if _, err := c.Start(7992, source, "mkv", "medium", nil, o); err == nil {
		t.Fatal("changed subtitle accepted")
	}
	os.WriteFile(sub, []byte(subtitleSRT), 0600)
	if _, err := c.Start(7992, source, "mkv", "medium", nil, o); err != nil {
		t.Fatal("original hash retry failed", err)
	}
	os.Rename(sub, sub+".held")
	if _, err := c.Start(7993, source, "mkv", "medium", nil, o); err == nil {
		t.Fatal("missing subtitle accepted")
	}
	os.Rename(sub+".held", sub)
	for _, entry := range mustMuxDir(t, dir) {
		if strings.HasPrefix(entry.Name(), ".nyacatch-mux-") {
			t.Fatal("temporary subtitle leaked")
		}
	}
}
