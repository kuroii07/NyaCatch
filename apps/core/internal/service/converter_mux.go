package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"caorushizi.cn/mediago/internal/core"
)

type MuxStream struct {
	Index       int               `json:"index"`
	Type        string            `json:"codec_type"`
	Codec       string            `json:"codec_name"`
	CodecTag    string            `json:"codec_tag_string,omitempty"`
	Width       int               `json:"width,omitempty"`
	Height      int               `json:"height,omitempty"`
	Channels    int               `json:"channels,omitempty"`
	Rate        string            `json:"sample_rate,omitempty"`
	Duration    string            `json:"duration,omitempty"`
	Start       string            `json:"start_time,omitempty"`
	Tags        map[string]string `json:"tags,omitempty"`
	Disposition struct {
		Attached int `json:"attached_pic"`
	} `json:"disposition"`
}
type MuxMedia struct {
	Path       string      `json:"path"`
	DurationMs int64       `json:"durationMs"`
	Size       int64       `json:"size"`
	ModifiedMs int64       `json:"modifiedMs"`
	Streams    []MuxStream `json:"streams"`
	Chapters   int         `json:"chapters"`
}
type MuxFormat struct {
	SubtitleCodec string `json:"subtitleCodec,omitempty"`
	Format        string `json:"format"`
	Available     bool   `json:"available"`
	Reason        string `json:"reason,omitempty"`
}
type MuxInspection struct {
	Subtitle *SubtitleInfo `json:"subtitle,omitempty"`
	Source   MuxMedia      `json:"source"`
	Audio    *MuxMedia     `json:"audio,omitempty"`
	Formats  []MuxFormat   `json:"formats"`
}

func (c *Converter) inspectMuxMedia(ctx context.Context, file string) (MuxMedia, error) {
	result := MuxMedia{Path: file}
	if !filepath.IsAbs(file) || len(file) > 4096 || strings.ContainsRune(file, 0) {
		return result, fmt.Errorf("mux requires an absolute local file path")
	}
	info, err := os.Stat(file)
	if err != nil || !info.Mode().IsRegular() {
		return result, fmt.Errorf("mux source is unavailable: %s", filepath.Base(file))
	}
	result.Size, result.ModifiedMs = info.Size(), info.ModTime().UnixMilli()
	probeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	probe := filepath.Join(filepath.Dir(c.ffmpegBin), "ffprobe"+filepath.Ext(c.ffmpegBin))
	cmd := exec.CommandContext(probeCtx, probe, "-v", "error", "-protocol_whitelist", "file", "-show_entries", "format=duration:stream=index,codec_type,codec_name,codec_tag_string,width,height,channels,sample_rate,duration,start_time:stream_tags:stream_disposition=attached_pic:chapter=id", "-of", "json", file)
	configureMediaCommand(cmd)
	raw, err := cmd.Output()
	if err != nil {
		return result, fmt.Errorf("cannot inspect mux source: %w", err)
	}
	var data struct {
		Streams []MuxStream `json:"streams"`
		Format  struct {
			Duration string `json:"duration"`
		} `json:"format"`
		Chapters []json.RawMessage `json:"chapters"`
	}
	if err = json.Unmarshal(raw, &data); err != nil || len(data.Streams) == 0 || len(data.Streams) > 64 {
		return result, fmt.Errorf("invalid mux source streams")
	}
	result.Streams = data.Streams
	result.Chapters = len(data.Chapters)
	duration, _ := strconv.ParseFloat(data.Format.Duration, 64)
	for _, stream := range data.Streams {
		if stream.Type == "video" && stream.Disposition.Attached == 0 {
			seconds, _ := strconv.ParseFloat(stream.Duration, 64)
			if seconds <= 0 {
				var h, m int
				var s float64
				if _, err := fmt.Sscanf(stream.Tags["DURATION"], "%d:%d:%f", &h, &m, &s); err == nil && h >= 0 && m >= 0 && m < 60 && s >= 0 && s < 60 {
					seconds = float64(h*3600+m*60) + s
					start, _ := strconv.ParseFloat(stream.Start, 64)
					seconds -= math.Max(0, start)
				}
			}
			if seconds > 0 {
				duration = seconds
			}
			break
		}
	}
	if duration <= 0 || math.IsNaN(duration) || math.IsInf(duration, 0) || duration > 1e8 {
		return result, fmt.Errorf("mux source duration is unavailable")
	}
	result.DurationMs = int64(math.Round(duration * 1000))
	return result, nil
}

func muxCodecAllowed(format string, s MuxStream) bool {
	var allowed string
	switch s.Type {
	case "video":
		switch format {
		case "mp4":
			allowed = "h264 hevc av1 mpeg4"
		case "mov":
			allowed = "h264 hevc prores mjpeg mpeg4"
		case "ts":
			allowed = "h264 hevc mpeg1video mpeg2video"
		case "mkv":
			allowed = "h264 hevc av1 vp8 vp9 mpeg4 mpeg1video mpeg2video mjpeg prores theora ffv1"
		}
	case "audio":
		switch format {
		case "mp4":
			allowed = "aac mp3 ac3 eac3 alac"
		case "mov":
			allowed = "aac mp3 ac3 eac3 alac pcm_u8 pcm_s16le pcm_s24le pcm_s32le pcm_f32le pcm_f64le pcm_s16be pcm_s24be pcm_s32be"
		case "ts":
			allowed = "aac mp3 mp2 ac3 eac3 dts"
		case "mkv":
			allowed = "aac mp3 mp2 ac3 eac3 dts alac flac opus vorbis pcm_u8 pcm_s16le pcm_s24le pcm_s32le pcm_f32le pcm_f64le pcm_s16be pcm_s24be pcm_s32be truehd"
		}
	case "subtitle":
		if format == "mp4" || format == "mov" {
			allowed = "mov_text"
		} else if format == "mkv" {
			allowed = "subrip ass ssa webvtt dvd_subtitle hdmv_pgs_subtitle dvb_subtitle"
		}
	case "attachment":
		return format == "mkv"
	}
	return s.Codec != "" && strings.Contains(" "+allowed+" ", " "+s.Codec+" ")
}
func muxTracks(source MuxMedia, audio *MuxMedia) []MuxStream {
	var streams []MuxStream
	for _, s := range source.Streams {
		if muxChapterStream(source, s) {
			continue
		}
		if audio == nil || s.Type != "audio" {
			streams = append(streams, s)
		}
	}
	if audio != nil {
		streams = append(streams, audio.Streams...)
	}
	return streams
}

// MP4/MOV may represent the chapter table as a separate QuickTime text data
// track. Rebuild that from map_chapters instead of treating it as arbitrary data.
func muxChapterStream(media MuxMedia, s MuxStream) bool {
	return media.Chapters > 0 && s.Type == "data" && s.Codec == "bin_data" && s.CodecTag == "text"
}
func muxCompatibility(source MuxMedia, audio *MuxMedia, format string) string {
	videos := 0
	for _, s := range source.Streams {
		if s.Type == "video" {
			if s.Disposition.Attached != 0 {
				return "mxCover"
			}
			videos++
		}
	}
	if videos != 1 {
		return "mxSingleVideo"
	}
	if audio != nil {
		if strings.EqualFold(filepath.Clean(audio.Path), filepath.Clean(source.Path)) {
			return "mxSameInput"
		}
		if len(audio.Streams) != 1 || audio.Streams[0].Type != "audio" {
			return "mxSingleAudio"
		}
	}
	if format == "ts" && source.Chapters > 0 {
		return "mxChapters"
	}
	for _, s := range muxTracks(source, audio) {
		if !muxCodecAllowed(format, s) {
			return fmt.Sprintf("mxCodec:%s:%s", s.Type, s.Codec)
		}
	}
	return ""
}
func (c *Converter) inspectMux(ctx context.Context, input, audio string, options ...*core.MuxOptions) (MuxInspection, error) {
	var result MuxInspection
	source, err := c.inspectMuxMedia(ctx, input)
	if err != nil {
		return result, err
	}
	result.Source = source
	if audio != "" {
		value, err := c.inspectMuxMedia(ctx, audio)
		if err != nil {
			return result, err
		}
		result.Audio = &value
	}
	var option *core.MuxOptions
	if len(options) > 0 {
		option = options[0]
	}
	if option != nil && option.SubtitlePath != "" {
		loaded, err := loadCompressionSubtitle(option.SubtitlePath)
		if err != nil {
			return result, err
		}
		result.Subtitle = &loaded.Info
	}
	for _, format := range []string{"mp4", "mkv", "mov", "ts"} {
		reason := muxCompatibility(source, result.Audio, format)
		codec := ""
		if result.Subtitle != nil {
			var subReason string
			codec, subReason = muxSubtitleCodec(format, result.Subtitle.Format, option.ConvertSubtitle)
			if reason == "" {
				reason = subReason
			}
			if option.SubtitleHash != "" && option.SubtitleHash != result.Subtitle.Hash {
				reason = "mxSubtitleChanged"
			}
		}
		result.Formats = append(result.Formats, MuxFormat{Format: format, Available: reason == "", Reason: reason, SubtitleCodec: codec})
	}
	return result, nil
}
func (s *ConversionService) InspectMux(parent context.Context, input, audio string, options ...*core.MuxOptions) (MuxInspection, error) {
	ctx, cancel := context.WithTimeout(parent, 25*time.Second)
	defer cancel()
	select {
	case s.converter.slots <- struct{}{}:
		defer func() { <-s.converter.slots }()
	case <-ctx.Done():
		return MuxInspection{}, ctx.Err()
	}
	return s.converter.inspectMux(ctx, input, audio, options...)
}

// Subtitle conversion is explicit and limited to the newly added track.
// Video, audio and existing subtitles always retain their original codecs.
func muxSubtitleCodec(format, subtitle string, convert bool) (string, string) {
	if format == "mkv" {
		if subtitle == "srt" {
			return "subrip", ""
		}
		if subtitle == "ass" {
			return "ass", ""
		}
	}
	if format == "mp4" || format == "mov" {
		if subtitle == "srt" {
			if convert {
				return "mov_text", ""
			}
			return "", "mxSubtitleConvertRequired"
		}
	}
	return "", "mxSubtitleMKV"
}
func muxFormatCheck(check MuxInspection, format string) (MuxFormat, error) {
	for _, f := range check.Formats {
		if f.Format == format {
			if !f.Available {
				return f, fmt.Errorf("incompatible lossless mux: %s", f.Reason)
			}
			return f, nil
		}
	}
	return MuxFormat{}, fmt.Errorf("unsupported mux container")
}
func (c *Converter) prepareMux(input, format string, settings *core.ConversionOptions) error {
	check, err := c.inspectMux(context.Background(), input, settings.Mux.AudioPath, settings.Mux)
	if err != nil {
		return err
	}
	if _, err = muxFormatCheck(check, format); err != nil {
		return err
	}
	o := settings.Mux
	o.SourceBytes = check.Source.Size
	o.SourceModifiedMs = check.Source.ModifiedMs
	o.AudioBytes, o.AudioModifiedMs = 0, 0
	if check.Audio != nil {
		o.AudioBytes = check.Audio.Size
		o.AudioModifiedMs = check.Audio.ModifiedMs
	}
	if check.Subtitle != nil {
		o.SubtitleHash = check.Subtitle.Hash
	}
	return nil
}
func (c *Converter) runMux(ctx context.Context, input, format string, progress ProgressCallback, settings *core.ConversionOptions) (string, error) {
	o := settings.Mux
	check, err := c.inspectMux(ctx, input, o.AudioPath, o)
	if err != nil {
		return "", err
	}
	selected, err := muxFormatCheck(check, format)
	if err != nil {
		return "", err
	}
	if (o.SourceBytes != 0 && o.SourceBytes != check.Source.Size) || (o.SourceModifiedMs != 0 && o.SourceModifiedMs != check.Source.ModifiedMs) {
		return "", fmt.Errorf("source file has changed; add it again")
	}
	if check.Audio != nil && ((o.AudioBytes != 0 && o.AudioBytes != check.Audio.Size) || (o.AudioModifiedMs != 0 && o.AudioModifiedMs != check.Audio.ModifiedMs)) {
		return "", fmt.Errorf("external audio has changed; add it again")
	}
	dir := settings.OutputDir
	if dir == "" {
		dir = filepath.Dir(input)
	}
	if err = os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	workspace, err := os.MkdirTemp(dir, ".nyacatch-mux-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(workspace)
	subtitleFile := ""
	if check.Subtitle != nil {
		loaded, err := loadCompressionSubtitle(o.SubtitlePath)
		if err != nil {
			return "", err
		}
		if loaded.Info.Hash != check.Subtitle.Hash {
			return "", fmt.Errorf("subtitle has changed; select it again")
		}
		subtitleFile = filepath.Join(workspace, "subtitle."+loaded.Info.Format)
		if err = os.WriteFile(subtitleFile, []byte(loaded.Text), 0600); err != nil {
			return "", err
		}
	}
	output := filepath.Join(workspace, "result."+format)
	args := []string{"-hide_banner", "-nostdin", "-y", "-protocol_whitelist", "file", "-i", input}
	if check.Audio != nil {
		args = append(args, "-protocol_whitelist", "file", "-i", o.AudioPath)
	}
	if subtitleFile != "" {
		args = append(args, "-protocol_whitelist", "file", "-i", subtitleFile)
	}
	// Explicit mappings preserve all source tracks except the audio the user replaces.
	for _, s := range check.Source.Streams {
		if muxChapterStream(check.Source, s) {
			continue
		}
		if check.Audio == nil || s.Type != "audio" {
			args = append(args, "-map", fmt.Sprintf("0:%d", s.Index))
		}
	}
	if check.Audio != nil {
		args = append(args, "-map", fmt.Sprintf("1:%d", check.Audio.Streams[0].Index), "-t", strconv.FormatFloat(float64(check.Source.DurationMs)/1000, 'f', 3, 64))
	}
	args = append(args, "-c", "copy", "-map_metadata", "0", "-map_chapters", "0")
	if subtitleFile != "" {
		inputIndex := 1
		if check.Audio != nil {
			inputIndex = 2
		}
		args = append(args, "-map", fmt.Sprintf("%d:s:0", inputIndex))
		index := 0
		for _, stream := range check.Source.Streams {
			if stream.Type == "subtitle" {
				index++
			}
		}
		if selected.SubtitleCodec == "mov_text" {
			args = append(args, fmt.Sprintf("-c:s:%d", index), "mov_text")
		}
		disposition := "0"
		if index == 0 {
			disposition = "default"
		}
		args = append(args, fmt.Sprintf("-disposition:s:%d", index), disposition)
	}
	if format == "mp4" || format == "mov" {
		args = append(args, "-movflags", "+faststart")
		for _, stream := range check.Source.Streams {
			if stream.Type == "video" && stream.Codec == "hevc" {
				args = append(args, "-tag:v", "hvc1")
			}
		}
	}
	args = append(args, output)
	if err = c.execute(ctx, args, time.Duration(check.Source.DurationMs)*time.Millisecond, progress); err != nil {
		return "", err
	}
	actual, err := c.inspectMuxMedia(ctx, output)
	if err != nil {
		return "", err
	}
	expected := muxTracks(check.Source, check.Audio)
	if subtitleFile != "" {
		expected = append(expected, MuxStream{Type: "subtitle", Codec: selected.SubtitleCodec})
	}
	actualTracks := muxTracks(actual, nil)
	if len(actualTracks) != len(expected) || actual.Chapters != check.Source.Chapters {
		return "", fmt.Errorf("mux output lost or added tracks")
	}
	// Stream order is explicit above. Encoder names, codecs, sample rates and dimensions
	// must survive; no decoder/encoder is involved in this operation.
	for i, s := range actualTracks {
		e := expected[i]
		if s.Type != e.Type || s.Codec != e.Codec || s.Width != e.Width || s.Height != e.Height || s.Channels != e.Channels || s.Rate != e.Rate {
			return "", fmt.Errorf("mux output track validation failed")
		}
	}
	if math.Abs(float64(actual.DurationMs-check.Source.DurationMs)) > math.Max(500, float64(check.Source.DurationMs)*.02) {
		return "", fmt.Errorf("mux output video duration validation failed")
	}
	if ctx.Err() != nil {
		return "", fmt.Errorf("mux cancelled")
	}
	base := strings.TrimSuffix(filepath.Base(input), filepath.Ext(input)) + "-remuxed"
	if check.Audio != nil || check.Subtitle != nil {
		base = strings.TrimSuffix(filepath.Base(input), filepath.Ext(input)) + "-muxed"
	}
	return copyConversionOutput(ctx, output, dir, base, format)
}
