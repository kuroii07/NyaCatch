package service

import (
	"caorushizi.cn/mediago/pkg/postmedia"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"slices"
	"strings"
	"sync"
	"time"
)

// Signed source URLs and extractor headers stay in memory, never in task records.
type playbackTrack struct {
	URL       string
	Extension string
	Headers   map[string]string
}

type MediaPlaybackInfo struct {
	ID    string `json:"id"`
	Video string `json:"video,omitempty"`
	Audio string `json:"audio,omitempty"`
}

type playbackSession struct {
	tracks  map[string]playbackTrack
	expires time.Time
	ctx     context.Context
	cancel  context.CancelFunc
}

type MediaPlayback struct {
	resolver *MediaResolver
	mu       sync.Mutex
	sessions map[string]*playbackSession
	slots    chan struct{}
}

func NewMediaPlayback(resolver *MediaResolver) *MediaPlayback {
	return &MediaPlayback{resolver: resolver, sessions: make(map[string]*playbackSession), slots: make(chan struct{}, 12)}
}

type playbackFormat struct {
	URL        string            `json:"url"`
	Extension  string            `json:"ext"`
	VideoCodec string            `json:"vcodec"`
	AudioCodec string            `json:"acodec"`
	Protocol   string            `json:"protocol"`
	Height     int               `json:"height"`
	DRM        bool              `json:"has_drm"`
	Headers    map[string]string `json:"http_headers"`
}

func playbackTracks(data []byte, source, mode string) (map[string]playbackTrack, error) {
	if mode != "video" && mode != "audio" {
		return nil, errors.New("invalid playback mode")
	}
	// Reuse preview's live/playlist/media validation before retaining any source URL.
	preview, err := ParseMediaPreview(strings.NewReader(string(data)), source)
	if err != nil {
		return nil, err
	}
	var metadata struct {
		playbackFormat
		Formats []playbackFormat `json:"formats"`
	}
	if err = json.Unmarshal(data, &metadata); err != nil {
		return nil, err
	}
	if metadata.DRM {
		return nil, errors.New("protected media cannot be previewed")
	}
	formats := metadata.Formats
	if metadata.URL != "" {
		formats = append(slices.Clone(formats), metadata.playbackFormat)
	}
	var videos, audios, mixed []playbackFormat
	for _, f := range formats {
		if f.DRM || ValidateMediaURL(f.URL) != nil || (f.Protocol != "" && f.Protocol != "http" && f.Protocol != "https") {
			continue
		}
		u, _ := url.Parse(f.URL)
		if strings.HasSuffix(strings.ToLower(u.Path), ".m3u8") || strings.HasSuffix(strings.ToLower(u.Path), ".mpd") {
			continue
		}
		ext := strings.ToLower(f.Extension)
		if !slices.Contains([]string{"mp4", "m4v", "webm", "m4a", "mp3", "aac", "ogg", "opus", "wav", "flac"}, ext) {
			continue
		}
		video, audio := (rawMediaFormat{Ext: f.Extension, VCodec: f.VideoCodec, ACodec: f.AudioCodec}).tracks()
		// Some extractors report dimensions for a progressive MP4 but leave
		// codecs unset. Missing metadata is not an explicit "none" track.
		if f.VideoCodec == "" && f.Height > 0 && slices.Contains([]string{"mp4", "m4v", "webm"}, ext) {
			video = true
			if f.AudioCodec == "" {
				audio = preview.HasAudio
			}
		}
		if !video && !audio && f.URL == source {
			video = preview.Kind == "video"
			audio = preview.Kind == "audio" || preview.HasAudio
		}
		if f.Headers == nil {
			f.Headers = map[string]string{}
		}
		// Per-format headers override top-level extractor headers.
		headers := make(map[string]string)
		for key, value := range metadata.Headers {
			headers[key] = value
		}
		for key, value := range f.Headers {
			headers[key] = value
		}
		f.Headers = headers
		if video {
			codec := strings.ToLower(f.VideoCodec)
			if codec != "" && !strings.HasPrefix(codec, "avc") && !strings.HasPrefix(codec, "h264") && !strings.HasPrefix(codec, "vp8") && !strings.HasPrefix(codec, "vp9") && !strings.HasPrefix(codec, "vp0") && !strings.HasPrefix(codec, "av01") {
				continue
			}
			videos = append(videos, f)
			if audio {
				mixed = append(mixed, f)
			}
		} else if audio {
			audios = append(audios, f)
		}
	}
	videoScore := func(f playbackFormat) int {
		score := min(f.Height, 720)
		if f.Height > 1080 {
			score -= 1000
		}
		if strings.HasPrefix(f.VideoCodec, "avc") || strings.HasPrefix(f.VideoCodec, "h264") {
			score += 2000
		}
		return score
	}
	slices.SortStableFunc(videos, func(a, b playbackFormat) int { return videoScore(b) - videoScore(a) })
	slices.SortStableFunc(mixed, func(a, b playbackFormat) int { return videoScore(b) - videoScore(a) })
	audioScore := func(f playbackFormat) int {
		if f.Extension == "m4a" {
			return 2
		}
		if f.Extension == "mp3" {
			return 1
		}
		return 0
	}
	slices.SortStableFunc(audios, func(a, b playbackFormat) int { return audioScore(b) - audioScore(a) })
	track := func(f playbackFormat) playbackTrack {
		return playbackTrack{URL: f.URL, Extension: f.Extension, Headers: f.Headers}
	}
	tracks := make(map[string]playbackTrack)
	if mode == "audio" {
		if len(audios) > 0 {
			tracks["audio"] = track(audios[0])
		} else if len(mixed) > 0 {
			tracks["audio"] = track(mixed[0])
		}
	} else if len(mixed) > 0 {
		tracks["video"] = track(mixed[0])
	} else if len(videos) > 0 && (!preview.HasAudio || len(audios) > 0) {
		tracks["video"] = track(videos[0])
		if preview.HasAudio {
			tracks["audio"] = track(audios[0])
		}
	}
	if len(tracks) == 0 {
		return nil, errors.New("no browser-compatible progressive media is available; downloading is still available")
	}
	return tracks, nil
}

func (s *MediaPlayback) Create(ctx context.Context, source, mode string) (*MediaPlaybackInfo, error) {
	return s.CreateWithResolver(ctx, source, mode, "")
}

func (s *MediaPlayback) CreateWithResolver(ctx context.Context, source, mode, resolver string) (*MediaPlaybackInfo, error) {
	return s.CreateResource(ctx, source, mode, resolver, "")
}

func (s *MediaPlayback) CreateResource(ctx context.Context, source, mode, resolver, resource string) (*MediaPlaybackInfo, error) {
	if err := ValidateMediaURL(source); err != nil {
		return nil, err
	}
	if mode != "audio" && mode != "video" {
		return nil, errors.New("invalid playback mode")
	}
	data, err := s.resolver.metadataResource(ctx, source, resolver, resource)
	if err != nil {
		return nil, err
	}
	tracks, err := playbackTracks(data, source, mode)
	if err != nil {
		return nil, err
	}
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	return s.add(tracks)
}

func (s *MediaPlayback) add(tracks map[string]playbackTrack) (*MediaPlaybackInfo, error) {
	key := make([]byte, 24)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	id := hex.EncodeToString(key)
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, session := range s.sessions {
		if now.After(session.expires) {
			session.cancel()
			delete(s.sessions, key)
		}
	}
	// Refuse excess sessions rather than evicting a different active player's tracks.
	if len(s.sessions) >= 24 {
		return nil, errors.New("too many playback sessions")
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.sessions[id] = &playbackSession{tracks: tracks, expires: now.Add(30 * time.Minute), ctx: ctx, cancel: cancel}
	result := &MediaPlaybackInfo{ID: id}
	if _, ok := tracks["video"]; ok {
		result.Video = "/api/media/playback/" + id + "/video"
	}
	if _, ok := tracks["audio"]; ok {
		result.Audio = "/api/media/playback/" + id + "/audio"
	}
	return result, nil
}

func (s *MediaPlayback) Remove(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if session, ok := s.sessions[id]; ok {
		session.cancel()
		delete(s.sessions, id)
	}
}

// Thumbnail capabilities use the same bounded, fixed-target streaming sessions
// as playback. Original thumbnail identities stay available for task caching.
func (s *MediaPlayback) AttachThumbnails(preview *MediaPreview) {
	items := []*MediaPreview{preview}
	for i := range preview.Resources {
		items = append(items, &preview.Resources[i])
	}
	tracks := map[string]playbackTrack{}
	for i, item := range items {
		if ValidateMediaURL(item.Thumbnail) == nil {
			key := fmt.Sprintf("thumb-%d", i)
			ext := "jpg"
			if slices.Contains([]string{"png", "jpeg", "jpg", "webp", "gif"}, item.Extension) {
				ext = item.Extension
			}
			if u, e := url.Parse(item.Thumbnail); e == nil {
				if candidate := strings.TrimPrefix(path.Ext(u.Path), "."); slices.Contains([]string{"png", "jpeg", "jpg", "webp", "gif"}, candidate) {
					ext = candidate
				}
			}
			tracks[key] = playbackTrack{URL: item.Thumbnail, Extension: ext}
			if item.Resolver == postmedia.DouyinResolver {
				tracks[key] = playbackTrack{URL: item.Thumbnail, Extension: ext, Headers: map[string]string{"Referer": "https://www.douyin.com/"}}
			}
		}
	}
	if len(tracks) == 0 {
		return
	}
	info, err := s.add(tracks)
	if err != nil {
		return
	}
	preview.PreviewSession = info.ID
	for i, item := range items {
		key := fmt.Sprintf("thumb-%d", i)
		if _, ok := tracks[key]; ok {
			item.DisplayThumbnail = "/api/media/playback/" + info.ID + "/" + key
		}
	}
}

func (s *MediaPlayback) Serve(w http.ResponseWriter, r *http.Request, id, kind string) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	s.mu.Lock()
	session, ok := s.sessions[id]
	if ok && time.Now().After(session.expires) {
		session.cancel()
		delete(s.sessions, id)
		ok = false
	}
	var track playbackTrack
	if ok {
		track, ok = session.tracks[kind]
	}
	s.mu.Unlock()
	if !ok {
		http.Error(w, "Preview expired; start playback again", http.StatusGone)
		return
	}
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		http.Error(w, "Too many streams", http.StatusTooManyRequests)
		return
	}
	ctx, cancel := context.WithDeadline(r.Context(), session.expires)
	defer cancel()
	stop := context.AfterFunc(session.ctx, cancel)
	defer stop()
	request, err := http.NewRequestWithContext(ctx, r.Method, track.URL, nil)
	if err != nil {
		http.Error(w, "Preview unavailable", 502)
		return
	}
	for key, value := range track.Headers {
		switch http.CanonicalHeaderKey(key) {
		case "User-Agent", "Referer", "Origin", "Accept", "Accept-Language":
			request.Header.Set(key, value)
		}
	}
	for _, key := range []string{"Range", "If-Range"} {
		if value := r.Header.Get(key); value != "" {
			request.Header.Set(key, value)
		}
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = 15 * time.Second
	transport.DisableCompression = true
	if s.resolver != nil && s.resolver.Config != nil {
		if enabled, _ := s.resolver.Config.Get("useProxy").(bool); enabled {
			if raw, _ := s.resolver.Config.Get("proxy").(string); raw != "" {
				p, e := url.Parse(raw)
				if e != nil {
					http.Error(w, "Invalid proxy", 502)
					return
				}
				transport.Proxy = http.ProxyURL(p)
			}
		}
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		return ValidateMediaURL(req.URL.String())
	}}
	response, err := client.Do(request)
	if err != nil {
		http.Error(w, "Source could not be played; retry preview", 502)
		return
	}
	defer response.Body.Close()
	if response.StatusCode != 200 && response.StatusCode != 206 && response.StatusCode != 416 {
		http.Error(w, "Source rejected playback; retry preview", 502)
		return
	}
	if strings.Contains(response.Header.Get("Content-Type"), "text/html") || strings.Contains(response.Header.Get("Content-Type"), "application/json") {
		http.Error(w, "Source returned no media", 502)
		return
	}
	for _, key := range []string{"Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"} {
		if value := response.Header.Get(key); value != "" {
			w.Header().Set(key, value)
		}
	}
	contentType := mime.TypeByExtension("." + track.Extension)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(response.StatusCode)
	if r.Method != http.MethodHead {
		_, _ = io.Copy(w, response.Body)
	}
}
