package service

import (
	"bytes"
	"caorushizi.cn/mediago/internal/core"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"golang.org/x/text/encoding/simplifiedchinese"
	textunicode "golang.org/x/text/encoding/unicode"
	"html"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const subtitleMaxBytes = 4 * 1024 * 1024

type SubtitleInfo struct {
	Format  string `json:"format"`
	Events  int    `json:"events"`
	FirstMs int64  `json:"firstMs"`
	LastMs  int64  `json:"lastMs"`
	Hash    string `json:"hash"`
}
type subtitleCue struct {
	Start, End int64
	Text       string
}
type loadedSubtitle struct {
	Info SubtitleInfo
	Text string
	Cues []subtitleCue
}

var subtitleClock = regexp.MustCompile(`^(\d{1,3}):([0-5]\d):([0-5]\d)[,.](\d{1,3})$`)
var subtitleBlank = regexp.MustCompile(`\n[ \t]*\n`)
var subtitleMarkup = regexp.MustCompile(`(?i)</?(?:b|i|u|font)(?:\s[^>]*)?>`)

func subtitleTime(value string) (int64, error) {
	m := subtitleClock.FindStringSubmatch(strings.TrimSpace(value))
	if m == nil {
		return 0, fmt.Errorf("invalid subtitle time")
	}
	v := []int64{}
	for _, p := range m[1:] {
		n, _ := strconv.ParseInt(p, 10, 64)
		v = append(v, n)
	}
	for i := len(m[4]); i < 3; i++ {
		v[3] *= 10
	}
	return (v[0]*3600+v[1]*60+v[2])*1000 + v[3], nil
}
func loadCompressionSubtitle(path string) (*loadedSubtitle, error) {
	ext := strings.ToLower(filepath.Ext(path))
	if !filepath.IsAbs(path) || len(path) > 4096 || strings.ContainsRune(path, 0) || (ext != ".srt" && ext != ".ass") {
		return nil, fmt.Errorf("select a local SRT or ASS file")
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("subtitle file unavailable: %w", err)
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > subtitleMaxBytes {
		return nil, fmt.Errorf("subtitle must be a regular file within 4 MiB")
	}
	raw, err := io.ReadAll(io.LimitReader(f, subtitleMaxBytes+1))
	if err != nil || len(raw) == 0 || len(raw) > subtitleMaxBytes {
		return nil, fmt.Errorf("subtitle is empty or exceeds 4 MiB")
	}
	sum := sha256.Sum256(raw)
	textBytes := bytes.TrimPrefix(raw, []byte{0xef, 0xbb, 0xbf})
	if bytes.HasPrefix(raw, []byte{0xff, 0xfe}) || bytes.HasPrefix(raw, []byte{0xfe, 0xff}) {
		textBytes, err = textunicode.UTF16(textunicode.LittleEndian, textunicode.ExpectBOM).NewDecoder().Bytes(raw)
	} else if !utf8.Valid(textBytes) {
		textBytes, err = simplifiedchinese.GB18030.NewDecoder().Bytes(raw)
	}
	if err != nil || !utf8.Valid(textBytes) || bytes.ContainsRune(textBytes, 0) || bytes.ContainsRune(textBytes, utf8.RuneError) {
		return nil, fmt.Errorf("subtitle text encoding is invalid")
	}
	result := &loadedSubtitle{Info: SubtitleInfo{Format: ext[1:], Hash: hex.EncodeToString(sum[:])}, Text: strings.ReplaceAll(strings.ReplaceAll(string(textBytes), "\r\n", "\n"), "\r", "\n")}
	if ext == ".srt" {
		for _, block := range subtitleBlank.Split(strings.TrimSpace(result.Text), -1) {
			lines := strings.Split(strings.TrimSpace(block), "\n")
			if len(lines) > 0 && !strings.Contains(lines[0], "-->") {
				lines = lines[1:]
			}
			if len(lines) < 2 {
				return nil, fmt.Errorf("invalid SRT cue")
			}
			parts := strings.Split(lines[0], "-->")
			if len(parts) != 2 {
				return nil, fmt.Errorf("invalid SRT timing")
			}
			endFields := strings.Fields(parts[1])
			if len(endFields) == 0 {
				return nil, fmt.Errorf("invalid SRT end")
			}
			start, e1 := subtitleTime(parts[0])
			end, e2 := subtitleTime(endFields[0])
			text := strings.TrimSpace(strings.Join(lines[1:], "\n"))
			if e1 != nil || e2 != nil || end <= start || text == "" {
				return nil, fmt.Errorf("invalid SRT range or text")
			}
			result.Cues = append(result.Cues, subtitleCue{start, end, text})
		}
	} else {
		low := strings.ToLower(result.Text)
		if !strings.Contains(low, "[script info]") || !strings.Contains(low, "[v4+ styles]") {
			return nil, fmt.Errorf("ASS headers are missing")
		}
		inEvents := false
		columns := []string{}
		si, ei := -1, -1
		for _, line := range strings.Split(result.Text, "\n") {
			line = strings.TrimSpace(line)
			lower := strings.ToLower(line)
			if strings.HasPrefix(line, "[") {
				inEvents = lower == "[events]"
				continue
			}
			if !inEvents {
				continue
			}
			if strings.HasPrefix(lower, "format:") {
				si, ei = -1, -1
				columns = strings.Split(line[len("format:"):], ",")
				for i, c := range columns {
					switch strings.ToLower(strings.TrimSpace(c)) {
					case "start":
						si = i
					case "end":
						ei = i
					}
				}
				continue
			}
			if !strings.HasPrefix(lower, "dialogue:") {
				continue
			}
			if len(columns) < 3 || si < 0 || ei < 0 || !strings.EqualFold(strings.TrimSpace(columns[len(columns)-1]), "text") {
				return nil, fmt.Errorf("invalid ASS event format")
			}
			values := strings.SplitN(line[len("dialogue:"):], ",", len(columns))
			if len(values) != len(columns) {
				return nil, fmt.Errorf("invalid ASS event")
			}
			start, e1 := subtitleTime(values[si])
			end, e2 := subtitleTime(values[ei])
			if e1 != nil || e2 != nil || end <= start {
				return nil, fmt.Errorf("invalid ASS range")
			}
			result.Cues = append(result.Cues, subtitleCue{start, end, values[len(values)-1]})
		}
	}
	if len(result.Cues) == 0 || len(result.Cues) > 20000 {
		return nil, fmt.Errorf("subtitle requires 1–20000 valid cues")
	}
	result.Info.Events = len(result.Cues)
	result.Info.FirstMs = result.Cues[0].Start
	for _, cue := range result.Cues {
		if cue.Start < result.Info.FirstMs {
			result.Info.FirstMs = cue.Start
		}
		if cue.End > result.Info.LastMs {
			result.Info.LastMs = cue.End
		}
	}
	return result, nil
}
func (s *ConversionService) InspectSubtitle(path string) (SubtitleInfo, error) {
	loaded, err := loadCompressionSubtitle(path)
	if err != nil {
		return SubtitleInfo{}, err
	}
	return loaded.Info, nil
}
func (s *ConversionService) PreviewSubtitle(ctx context.Context, path string, edge int, atMs int64, sub *core.CompressionSubtitle) ([]byte, error) {
	return s.converter.PreviewSubtitle(ctx, path, edge, atMs, sub)
}
func assTime(ms int64) string {
	return fmt.Sprintf("%d:%02d:%02d.%02d", ms/3600000, ms/60000%60, ms/1000%60, ms/10%100)
}
func assColor(v string) string { return "&H00" + strings.ToUpper(v[5:7]+v[3:5]+v[1:3]) }
func writeCompressionSubtitle(dir string, sub *core.CompressionSubtitle, source mergeMedia) error {
	if sub == nil {
		return nil
	}
	if err := sub.Validate(); err != nil {
		return err
	}
	loaded, err := loadCompressionSubtitle(sub.Path)
	if err != nil {
		return err
	}
	if sub.SourceHash != "" && sub.SourceHash != loaded.Info.Hash {
		return fmt.Errorf("subtitle has changed; select it again")
	}
	text := loaded.Text
	if loaded.Info.Format == "srt" {
		v := sub.Style
		align := 2
		if v.Position == "top" {
			align = 8
		} else if v.Position == "middle" {
			align = 5
		}
		var b strings.Builder
		fmt.Fprintf(&b, "[Script Info]\nScriptType: v4.00+\nPlayResX: %d\nPlayResY: 1080\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,%s,%d,%s,&H000000FF,%s,&H80000000,0,0,0,0,100,100,0,0,1,%d,0,%d,48,48,48,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n", int(math.Max(1, math.Round(float64(source.width)*1080/float64(source.height)))), v.FontFamily, v.FontSize, assColor(v.Color), assColor(v.OutlineColor), v.Outline, align)
		escape := strings.NewReplacer("\\", "\\\u200b", "{", "\\{", "}", "\\}")
		for _, cue := range loaded.Cues {
			plain := html.UnescapeString(subtitleMarkup.ReplaceAllString(cue.Text, ""))
			lines := strings.Split(plain, "\n")
			for i, line := range lines {
				lines[i] = escape.Replace(line)
			}
			fmt.Fprintf(&b, "Dialogue: 0,%s,%s,Default,,0,0,0,,%s\n", assTime(cue.Start), assTime(cue.End), strings.Join(lines, "\\N"))
		}
		text = b.String()
	}
	return os.WriteFile(filepath.Join(dir, "subtitle.ass"), []byte(text), 0600)
}
func compressionFilters(edge, fps int, sub *core.CompressionSubtitle, startMs int64) []string {
	filters := []string{}
	if edge > 0 {
		if edge%2 != 0 {
			edge--
		}
		filters = append(filters, fmt.Sprintf("scale=w='min(iw,%d)':h='min(ih,%d)':force_original_aspect_ratio=decrease", edge, edge))
	}
	filters = append(filters, "pad=ceil(iw/2)*2:ceil(ih/2)*2")
	if fps > 0 {
		filters = append(filters, fmt.Sprintf("fps=%d", fps))
	}
	if sub != nil {
		shift := float64(startMs-sub.OffsetMs) / 1000
		filters = append(filters, fmt.Sprintf("setpts=PTS%+.3f/TB", shift), "ass=filename=subtitle.ass", fmt.Sprintf("setpts=PTS%+.3f/TB", -shift))
	}
	return filters
}

// A real libass frame uses the export filter chain, without creating a task or playing media.
func (c *Converter) PreviewSubtitle(parent context.Context, input string, edge int, atMs int64, sub *core.CompressionSubtitle) ([]byte, error) {
	ctx, cancel := context.WithTimeout(parent, 15*time.Second)
	defer cancel()
	if sub == nil || !filepath.IsAbs(input) || atMs < 0 {
		return nil, fmt.Errorf("invalid subtitle preview")
	}
	settings := &core.ConversionOptions{Version: 1, MaxEdge: edge, Compress: &core.CompressionOptions{Codec: "h264", CRF: 23, Preset: "fast", Audio: "aac", Bitrate: 192, Subtitle: sub}}
	if err := settings.Validate("mp4"); err != nil {
		return nil, err
	}
	select {
	case c.slots <- struct{}{}:
		defer func() { <-c.slots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	source, err := c.inspectCompression(ctx, input)
	if err != nil {
		return nil, err
	}
	if err = compressionSourceAllowed(source, "mp4", settings); err != nil {
		return nil, err
	}
	if atMs >= source.duration.Milliseconds() {
		return nil, fmt.Errorf("preview time exceeds video")
	}
	dir, err := os.MkdirTemp("", ".nyacatch-subtitle-preview-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	if err = writeCompressionSubtitle(dir, sub, source); err != nil {
		return nil, err
	}
	filters := compressionFilters(edge, 0, sub, atMs)
	filters = append(filters, "scale=w='min(iw,960)':h='min(ih,960)':force_original_aspect_ratio=decrease")
	cmd := exec.CommandContext(ctx, c.ffmpegBin, "-hide_banner", "-v", "error", "-nostdin", "-filter_threads", "1", "-threads", "2", "-protocol_whitelist", "file", "-ss", fmt.Sprintf("%.3f", float64(atMs)/1000), "-i", input, "-map", fmt.Sprintf("0:%d", source.video), "-vf", strings.Join(filters, ","), "-an", "-sn", "-dn", "-frames:v", "1", "-threads", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1")
	cmd.Dir = dir
	configureMediaCommand(cmd)
	raw, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("subtitle preview failed: %w", err)
	}
	if len(raw) < 8 || len(raw) > 5*1024*1024 || !bytes.HasPrefix(raw, []byte{137, 80, 78, 71, 13, 10, 26, 10}) {
		return nil, fmt.Errorf("subtitle preview produced no image")
	}
	return raw, nil
}
