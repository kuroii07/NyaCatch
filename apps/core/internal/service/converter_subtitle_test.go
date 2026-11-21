package service

import (
	"bytes"
	"caorushizi.cn/mediago/internal/core"
	"context"
	"golang.org/x/text/encoding/simplifiedchinese"
	textunicode "golang.org/x/text/encoding/unicode"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const subtitleSRT = "1\r\n00:00:01,000 --> 00:00:03,000\r\n字幕测试 HELLO\r\n\r\n2\r\n00:00:03,100 --> 00:00:03,900\r\n第二行\r\n"

func testSub(path string) *core.CompressionSubtitle {
	return &core.CompressionSubtitle{Path: path, Style: &core.SubtitleStyle{FontFamily: "Microsoft YaHei", FontSize: 72, Color: "#FFFFFF", OutlineColor: "#000000", Outline: 2, Position: "bottom"}}
}
func TestSubtitleParsingAndEncoding(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "字幕 ' #.srt")
	os.WriteFile(file, []byte(subtitleSRT), 0600)
	loaded, err := loadCompressionSubtitle(file)
	if err != nil || loaded.Info.Events != 2 || loaded.Info.FirstMs != 1000 || loaded.Info.LastMs != 3900 || len(loaded.Info.Hash) != 64 {
		t.Fatal(loaded, err)
	}
	gbk, _ := simplifiedchinese.GB18030.NewEncoder().Bytes([]byte(subtitleSRT))
	os.WriteFile(file, gbk, 0600)
	loaded, err = loadCompressionSubtitle(file)
	if err != nil || !strings.Contains(loaded.Cues[0].Text, "字幕测试") {
		t.Fatal(err)
	}
	for _, order := range []textunicode.Endianness{textunicode.LittleEndian, textunicode.BigEndian} {
		encoded, _ := textunicode.UTF16(order, textunicode.UseBOM).NewEncoder().Bytes([]byte(subtitleSRT))
		os.WriteFile(file, encoded, 0600)
		value, err := loadCompressionSubtitle(file)
		if err != nil || value.Info.Events != 2 || !strings.Contains(value.Cues[0].Text, "字幕测试") {
			t.Fatal("UTF16", err)
		}
	}
	os.WriteFile(file, []byte("not subtitles"), 0600)
	if _, err = loadCompressionSubtitle(file); err == nil {
		t.Fatal("invalid SRT accepted")
	}
	os.WriteFile(file, make([]byte, 4*1024*1024+1), 0600)
	if _, err = loadCompressionSubtitle(file); err == nil {
		t.Fatal("oversize accepted")
	}
}

func TestSubtitleRenderPreviewAndTrialClock(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	video := filepath.Join(dir, "视频 ' #.mp4")
	sub := filepath.Join(dir, "字幕 ' #.srt")
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "color=black:s=320x180:r=24:d=4", "-c:v", "libx264", "-threads", "1", video)
	os.WriteFile(sub, []byte(subtitleSRT), 0600)
	c := NewConverter(bin)
	pixels := func(raw []byte) int {
		img, err := png.Decode(bytes.NewReader(raw))
		if err != nil {
			t.Fatal(err)
		}
		n := 0
		for y := 0; y < img.Bounds().Dy(); y++ {
			for x := 0; x < img.Bounds().Dx(); x++ {
				r, g, b, _ := img.At(x, y).RGBA()
				if r+g+b > 12000 {
					n++
				}
			}
		}
		return n
	}
	for _, point := range []struct {
		ms, offset int64
		visible    bool
	}{{500, 0, false}, {1500, 0, true}, {1500, 1000, false}, {2500, 1000, true}, {500, -1000, true}} {
		s := testSub(sub)
		s.OffsetMs = point.offset
		raw, err := c.PreviewSubtitle(context.Background(), video, 0, point.ms, s)
		if err != nil {
			t.Fatal(err)
		}
		if (pixels(raw) > 30) != point.visible {
			t.Fatal("preview offset", point, pixels(raw))
		}
	}
	for _, codec := range []string{"h264", "hevc"} {
		for _, target := range []int64{0, 1000000} {
			o := &core.ConversionOptions{Version: 1, Compress: &core.CompressionOptions{Codec: codec, CRF: 23, Preset: "fast", Audio: "aac", Bitrate: 192, Subtitle: testSub(sub), Trial: &core.TrimRange{StartMs: 1500, EndMs: 2500}, TargetBytes: target}}
			if target > 0 {
				o.Compress.CRF = 0
			}
			_, err := c.prepareCompression(video, "mp4", o)
			if err != nil {
				t.Fatal(err)
			}
			out, err := c.Start(7400+target, video, "mp4", "medium", nil, o)
			if err != nil {
				t.Fatal(err)
			}
			raw := fixtureCommand(t, bin, "-v", "error", "-i", out, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1")
			if pixels(raw) < 30 {
				t.Fatal("trial lost source clock")
			}
			os.WriteFile(sub, []byte(subtitleSRT+"\n"), 0600)
			if _, err = c.Start(7401+target, video, "mp4", "medium", nil, o); err == nil {
				t.Fatal("changed subtitle accepted")
			}
			os.WriteFile(sub, []byte(subtitleSRT), 0600)
		}
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".nyacatch-compress-") {
			t.Fatal("subtitle workspace leaked")
		}
	}
}

const subtitleASS = "[Script Info]\nScriptType: v4.00+\nPlayResX: 320\nPlayResY: 180\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,24,&H0000FF00,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,8,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,ORIGINAL STYLE\n"

func TestSubtitleASSStylesAndCancellation(t *testing.T) {
	bin := os.Getenv("NYACATCH_TEST_FFMPEG")
	if bin == "" {
		t.Skip("NYACATCH_TEST_FFMPEG not set")
	}
	dir := t.TempDir()
	video := filepath.Join(dir, "v.mp4")
	file := filepath.Join(dir, "style ' #.ass")
	os.WriteFile(file, []byte(subtitleASS), 0600)
	fixtureCommand(t, bin, "-v", "error", "-f", "lavfi", "-i", "color=black:s=320x180:r=24:d=4", "-c:v", "libx264", "-threads", "1", video)
	c := NewConverter(bin)
	sub := &core.CompressionSubtitle{Path: file}
	raw, err := c.PreviewSubtitle(context.Background(), video, 0, 1500, sub)
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	top, bottom := 0, 0
	for y := 0; y < 180; y++ {
		for x := 0; x < 320; x++ {
			r, g, b, _ := img.At(x, y).RGBA()
			if g > r*2 && g > b*2 && g > 12000 {
				if y < 90 {
					top++
				} else {
					bottom++
				}
			}
		}
	}
	if top < 30 || bottom != 0 {
		t.Fatal("ASS lost original color or alignment", top, bottom)
	}
	c.slots <- struct{}{}
	c.slots <- struct{}{}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err = c.PreviewSubtitle(ctx, video, 0, 1500, sub); err == nil {
		t.Fatal("busy preview ignored cancellation")
	}
	<-c.slots
	<-c.slots
	os.WriteFile(file, []byte(subtitleASS+"Format: Text, Layer, End\nDialogue: missing,0,0:00:03.00"), 0600)
	if _, err = loadCompressionSubtitle(file); err == nil {
		t.Fatal("ASS with replaced invalid columns accepted")
	}
}
