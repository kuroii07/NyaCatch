package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"

	"caorushizi.cn/mediago/pkg/collection"
	"caorushizi.cn/mediago/pkg/postmedia"
	"caorushizi.cn/mediago/pkg/xmedia"
)

type MediaPreview struct {
	Collection       *collection.Selection `json:"collection,omitempty"`
	URL              string                `json:"url"`
	Title            string                `json:"title"`
	Kind             string                `json:"kind"`
	Extension        string                `json:"extension"`
	Thumbnail        string                `json:"thumbnail,omitempty"`
	PreviewURL       string                `json:"previewUrl,omitempty"`
	Duration         float64               `json:"duration"`
	Source           string                `json:"source"`
	Uploader         string                `json:"uploader,omitempty"`
	HasAudio         bool                  `json:"hasAudio"`
	Formats          []MediaFormat         `json:"formats"`
	Resolver         string                `json:"resolver,omitempty"`
	ResourceID       string                `json:"resourceId,omitempty"`
	Resources        []MediaPreview        `json:"resources,omitempty"`
	DisplayThumbnail string                `json:"displayThumbnail,omitempty"`
	PreviewSession   string                `json:"previewSession,omitempty"`
}

func ValidateMediaURL(input string) error {
	parsed, err := url.Parse(input)
	if err != nil || parsed == nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" || parsed.User != nil {
		return errors.New("only HTTP(S) media links without embedded credentials are supported")
	}
	return nil
}

var mediaExtension = regexp.MustCompile(`^[a-zA-Z0-9]{1,8}$`)

func ParseMediaPreview(reader io.Reader, source string) (*MediaPreview, error) {
	data, err := io.ReadAll(io.LimitReader(reader, 4*1024*1024+1))
	if err != nil || len(data) > 4*1024*1024 {
		return nil, errors.New("media metadata exceeds preview limit")
	}
	var collection struct {
		Type    string            `json:"_type"`
		Entries []json.RawMessage `json:"entries"`
	}
	if json.Unmarshal(data, &collection) != nil {
		return nil, errors.New("invalid media metadata")
	}
	if collection.Type == "playlist" || collection.Type == "multi_video" {
		_, xerr := xmedia.StatusID(source)
		_, igerr := postmedia.InstagramID(source)
		_, xhserr := postmedia.XhsID(source)
		dyerr := postmedia.ValidateDouyinSource(source)
		if xerr != nil && igerr != nil && xhserr != nil && dyerr != nil {
			return nil, errors.New("playlists and live streams require the advanced download flow")
		}
		if len(collection.Entries) == 0 || len(collection.Entries) > 20 {
			return nil, errors.New("post resource count is outside supported range")
		}
		items := []MediaPreview{}
		seen := map[string]bool{}
		for _, entry := range collection.Entries {
			var info map[string]any
			if json.Unmarshal(entry, &info) != nil {
				return nil, errors.New("unavailable post resource")
			}
			if info["_type"] == "playlist" || info["_type"] == "multi_video" {
				return nil, errors.New("nested media collection is unsupported")
			}
			id, e := postmedia.ResourceID(info)
			if e != nil || seen[id] {
				return nil, errors.New("post resource has no unique stable identifier")
			}
			seen[id] = true
			item, e := ParseMediaPreview(bytes.NewReader(entry), source)
			if e != nil {
				return nil, e
			}
			if dyerr == nil && (item.Kind != "image" || item.Resolver != postmedia.DouyinResolver) {
				return nil, errors.New("Douyin collections require verified image resources")
			}
			item.ResourceID = id
			items = append(items, *item)
		}
		result := items[0]
		result.Resources = items
		return &result, nil
	}
	var metadata struct {
		Type         string           `json:"_type"`
		Title        string           `json:"title"`
		ID           string           `json:"id"`
		URL          string           `json:"url"`
		Ext          string           `json:"ext"`
		Thumbnail    string           `json:"thumbnail"`
		Duration     float64          `json:"duration"`
		IsLive       bool             `json:"is_live"`
		VCodec       string           `json:"vcodec"`
		ACodec       string           `json:"acodec"`
		ExtractorKey string           `json:"extractor_key"`
		Uploader     string           `json:"uploader"`
		Channel      string           `json:"channel"`
		Formats      []rawMediaFormat `json:"formats"`
		Resolver     string           `json:"_nyacatch_resolver"`
		Kind         string           `json:"_nyacatch_kind"`
		ResourceID   string           `json:"_nyacatch_resource_id"`
	}
	if err := json.Unmarshal(data, &metadata); err != nil {
		return nil, fmt.Errorf("invalid media metadata: %w", err)
	}
	if metadata.Type == "playlist" || metadata.Type == "multi_video" || metadata.IsLive {
		return nil, errors.New("playlists and live streams require the advanced download flow")
	}
	hasVideo, hasAudio := (rawMediaFormat{Ext: metadata.Ext, VCodec: metadata.VCodec, ACodec: metadata.ACodec}).tracks()
	for _, format := range metadata.Formats {
		video, audio := format.tracks()
		hasVideo = hasVideo || video
		hasAudio = hasAudio || audio
	}
	// Generic direct-file extraction does not probe codecs when ffprobe is absent.
	// Only recognize known media extensions; an arbitrary webpage is still rejected.
	if !hasVideo && !hasAudio && metadata.Kind != "image" {
		switch strings.ToLower(metadata.Ext) {
		case "mp4", "webm", "mkv", "mov", "flv", "m4v", "avi", "ts":
			hasVideo = true
		case "mp3", "m4a", "aac", "ogg", "opus", "wav", "flac":
			hasAudio = true
		}
	}
	if !hasVideo && !hasAudio && metadata.Kind != "image" {
		return nil, errors.New("no downloadable video or audio found")
	}
	result := &MediaPreview{URL: source, Title: strings.TrimSpace(metadata.Title), Kind: "video", Duration: metadata.Duration, Source: metadata.ExtractorKey, Uploader: strings.TrimSpace(metadata.Uploader), HasAudio: hasAudio, Formats: normalizeFormats(metadata.Formats)}
	if metadata.Resolver == xmedia.Resolver {
		if _, err := xmedia.StatusID(source); err != nil {
			return nil, err
		}
		result.Resolver = metadata.Resolver
	}
	if metadata.Resolver == postmedia.InstagramResolver {
		if _, err := postmedia.InstagramID(source); err != nil {
			return nil, err
		}
		result.Resolver = metadata.Resolver
	}
	if metadata.Resolver == postmedia.XhsResolver {
		if _, err := postmedia.XhsID(source); err != nil {
			return nil, err
		}
		result.Resolver = metadata.Resolver
	}
	if metadata.Resolver == postmedia.DouyinResolver {
		if err := postmedia.ValidateDouyinSource(source); err != nil {
			return nil, err
		}
		result.Resolver = metadata.Resolver
	}
	result.ResourceID = metadata.ResourceID
	if result.Source == "" {
		parsed, _ := url.Parse(source)
		result.Source = strings.TrimPrefix(parsed.Hostname(), "www.")
	}
	if result.Uploader == "" {
		result.Uploader = strings.TrimSpace(metadata.Channel)
	}
	if !hasVideo {
		result.Kind = "audio"
	}
	if metadata.Kind == "image" {
		if result.Resolver == "" || (result.Resolver == postmedia.DouyinResolver && (len(metadata.Formats) != 0 || !postmedia.DouyinCDNURL(metadata.URL))) {
			return nil, errors.New("untrusted image metadata")
		}
		result.Kind = "image"
	}
	if result.Title == "" {
		result.Title = metadata.ID
	}
	if result.Title == "" {
		result.Title = "media"
	}
	if result.Duration < 0 {
		result.Duration = 0
	}
	if mediaExtension.MatchString(metadata.Ext) {
		result.Extension = strings.ToLower(metadata.Ext)
	}
	if ValidateMediaURL(metadata.Thumbnail) == nil {
		result.Thumbnail = metadata.Thumbnail
	}
	// Only play the original direct URL. Extracted platform streams may need cookies or headers.
	if metadata.URL == source {
		result.PreviewURL = source
	}
	return result, nil
}

type MediaResolver struct {
	Binary  string
	Config  interface{ Get(string) any }
	extract func(context.Context, string, string) ([]byte, error)
	public  func(context.Context, string, string, string) ([]byte, error)
	probe   func(context.Context, playbackTrack) (rawMediaFormat, error)
}

func NewMediaResolver(binDir string) *MediaResolver {
	name := "yt-dlp"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return &MediaResolver{Binary: filepath.Join(binDir, name)}
}

// cappedOutput drains the process while bounding memory even if an extractor is noisy.
type cappedOutput struct {
	bytes.Buffer
	limit    int
	overflow bool
}

func (b *cappedOutput) Write(p []byte) (int, error) {
	n := len(p)
	remaining := b.limit - b.Len()
	if remaining < n {
		b.overflow = true
	}
	if remaining > 0 {
		_, _ = b.Buffer.Write(p[:min(remaining, n)])
	}
	return n, nil
}

func (r *MediaResolver) Resolve(ctx context.Context, input string) (*MediaPreview, error) {
	data, err := r.metadata(ctx, input)
	if err != nil {
		return nil, err
	}
	p, err := ParseMediaPreview(bytes.NewReader(data), input)
	if err == nil && p.Kind == "image" && len(p.Resources) == 0 {
		item := *p
		p.Resources = []MediaPreview{item}
	}
	return p, err
}

func (r *MediaResolver) metadata(ctx context.Context, input string) ([]byte, error) {
	return r.metadataFor(ctx, input, "")
}

func (r *MediaResolver) metadataFor(ctx context.Context, input, route string) ([]byte, error) {
	return r.metadataResource(ctx, input, route, "")
}

func (r *MediaResolver) metadataResource(ctx context.Context, input, route, resource string) ([]byte, error) {
	if err := ValidateMediaURL(input); err != nil {
		return nil, err
	}
	if route != "" && route != xmedia.Resolver && route != postmedia.InstagramResolver && route != postmedia.XhsResolver && route != postmedia.DouyinResolver {
		return nil, errors.New("unsupported media resolver")
	}
	if route == xmedia.Resolver {
		if _, err := xmedia.StatusID(input); err != nil {
			return nil, err
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	proxy := ""
	if r.Config != nil {
		enabled, _ := r.Config.Get("useProxy").(bool)
		if enabled {
			proxy, _ = r.Config.Get("proxy").(string)
		}
	}
	public := r.public
	if public == nil {
		public = xmedia.FetchCollection
	}
	if route == postmedia.InstagramResolver {
		if _, err := postmedia.InstagramID(input); err != nil {
			return nil, err
		}
		data, err := r.extractMetadata(ctx, input, proxy)
		if err != nil {
			return nil, err
		}
		if resource != "" {
			data, err = postmedia.Select(data, resource)
		}
		return r.enrichTracks(ctx, data), err
	}
	if route == postmedia.XhsResolver {
		data, err := postmedia.ExtractXhs(ctx, input, proxy)
		if err != nil {
			return nil, err
		}
		if resource != "" {
			return postmedia.Select(data, resource)
		}
		return data, nil
	}
	if route == postmedia.DouyinResolver {
		data, err := postmedia.ExtractDouyin(ctx, input, proxy)
		if err != nil {
			return nil, err
		}
		if resource != "" {
			data, err = postmedia.Select(data, resource)
			if err != nil {
				return nil, err
			}
		}
		return r.enrichTracks(ctx, data), nil
	}
	if route == xmedia.Resolver {
		if resource != "" {
			return xmedia.FetchResource(ctx, input, filepath.Dir(r.Binary), proxy, resource)
		}
		return public(ctx, input, filepath.Dir(r.Binary), proxy)
	}
	extract := r.extract
	if extract == nil {
		extract = r.extractMetadata
	}
	data, err := extract(ctx, input, proxy)
	if err == nil {
		// yt-dlp may return only the video part of a mixed X post. Inspect the
		// finite public inventory, while retaining the primary route for one video.
		if _, xe := xmedia.StatusID(input); xe == nil && resource == "" && r.extract == nil {
			mediaParseProgress(ctx, "inventory")
			if inventory, e := xmedia.FetchInventory(ctx, input, filepath.Dir(r.Binary), proxy); e == nil {
				return inventory, nil
			}
		}
		if resource != "" {
			data, err = postmedia.Select(data, resource)
			if err != nil {
				return nil, err
			}
		}
		return r.enrichTracks(ctx, data), nil
	}
	if ctx.Err() == nil && r.extract == nil {
		if postmedia.ValidateDouyinSource(input) == nil {
			data, dyErr := postmedia.ExtractDouyin(ctx, input, proxy)
			if dyErr == nil {
				if resource != "" {
					data, dyErr = postmedia.Select(data, resource)
					if dyErr != nil {
						return nil, dyErr
					}
				}
				return r.enrichTracks(ctx, data), nil
			}
			return nil, fmt.Errorf("%w; anonymous Douyin fallback failed: %v", err, dyErr)
		}
		if _, xhsErr := postmedia.XhsID(input); xhsErr == nil {
			data, xhsErr := postmedia.ExtractXhs(ctx, input, proxy)
			if xhsErr == nil {
				if resource != "" {
					return postmedia.Select(data, resource)
				}
				return data, nil
			}
			return nil, fmt.Errorf("%w; anonymous Xiaohongshu image fallback failed: %v", err, xhsErr)
		}
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || !xmedia.ShouldFallback(input, err.Error()) {
		return nil, err
	}
	mediaParseProgress(ctx, "fallback")
	data, fallbackErr := public(ctx, input, filepath.Dir(r.Binary), proxy)
	if fallbackErr != nil {
		return nil, &mediaParseError{primary: err, fallback: fallbackErr}
	}
	return data, nil
}

func (r *MediaResolver) extractMetadata(ctx context.Context, input, proxy string) ([]byte, error) {
	timeout := 40 * time.Second
	if _, err := xmedia.StatusID(input); err == nil {
		timeout = 25 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	args := append(postmedia.PluginArguments(filepath.Dir(r.Binary), input), MediaPreviewArguments(input, proxy)...)
	command := exec.CommandContext(ctx, r.Binary, args...)
	command.WaitDelay = time.Second
	configureMediaCommand(command)
	stdout := &cappedOutput{limit: 4 * 1024 * 1024}
	stderr := &cappedOutput{limit: 4096}
	command.Stdout, command.Stderr = stdout, stderr
	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("media preview timed out or was cancelled: %w", ctx.Err())
		}
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = err.Error()
		}
		return nil, fmt.Errorf("media extraction failed: %s", detail)
	}
	if stdout.overflow {
		return nil, errors.New("media metadata exceeds the preview size limit")
	}
	return stdout.Bytes(), nil
}

func MediaPreviewArguments(input, proxy string) []string {
	args := []string{"--ignore-config", "--dump-single-json", "--skip-download", "--no-playlist",
		"--no-warnings", "--no-progress", "--socket-timeout", "15", "--retries", "0"}
	if proxy != "" {
		args = append(args, "--proxy", proxy)
	}
	return append(args, "--", input)
}
