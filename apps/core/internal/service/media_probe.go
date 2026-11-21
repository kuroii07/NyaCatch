package service

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"time"
)

// Probe only missing progressive-track metadata. Explicit "none" is authoritative.
// Failure leaves the existing download route available without inventing codecs.
func (r *MediaResolver) enrichTracks(ctx context.Context, data []byte) []byte {
	var root map[string]any
	if json.Unmarshal(data, &root) != nil || root["is_live"] == true {
		return data
	}
	if entries, ok := root["entries"].([]any); ok {
		for i, entry := range entries {
			if i >= 3 {
				break
			}
			b, e := json.Marshal(entry)
			if e == nil {
				var enriched any
				if json.Unmarshal(r.enrichTracks(ctx, b), &enriched) == nil {
					entries[i] = enriched
				}
			}
		}
		b, e := json.Marshal(root)
		if e == nil {
			return b
		}
		return data
	}
	probe := r.probe
	if probe == nil {
		probe = r.probeTrack
	}
	items := []map[string]any{root}
	if formats, ok := root["formats"].([]any); ok {
		for _, f := range formats {
			if m, ok := f.(map[string]any); ok {
				items = append(items, m)
			}
		}
	}
	type outcome struct {
		info rawMediaFormat
		err  error
	}
	cache := make(map[string]outcome)
	changed := false
	for _, item := range items {
		str := func(k string) string { s, _ := item[k].(string); return s }
		if (str("vcodec") != "" && str("acodec") != "") || item["has_drm"] == true || ValidateMediaURL(str("url")) != nil {
			continue
		}
		ext, protocol := strings.ToLower(str("ext")), str("protocol")
		if !slices.Contains([]string{"mp4", "m4v", "webm", "m4a"}, ext) || (protocol != "" && protocol != "http" && protocol != "https") {
			continue
		}
		result, exists := cache[str("url")]
		if !exists {
			if len(cache) >= 2 {
				continue
			}
			headers := make(map[string]string)
			for _, value := range []any{root["http_headers"], item["http_headers"]} {
				if h, ok := value.(map[string]any); ok {
					for k, v := range h {
						if s, ok := v.(string); ok {
							headers[k] = s
						}
					}
				}
			}
			result.info, result.err = probe(ctx, playbackTrack{URL: str("url"), Extension: ext, Headers: headers})
			cache[str("url")] = result
		}
		if result.err != nil {
			continue
		}
		if str("vcodec") == "" {
			item["vcodec"] = result.info.VCodec
			changed = true
		}
		if str("acodec") == "" {
			item["acodec"] = result.info.ACodec
			changed = true
		}
		if h, _ := item["height"].(float64); h <= 0 && result.info.Height > 0 {
			item["height"] = result.info.Height
			item["width"] = result.info.Width
		}
	}
	if !changed {
		return data
	}
	enriched, err := json.Marshal(root)
	if err != nil {
		return data
	}
	return enriched
}

func (r *MediaResolver) probeTrack(ctx context.Context, track playbackTrack) (rawMediaFormat, error) {
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	// Reuse the fixed-target playback proxy for source headers, Range and the
	// configured proxy. Signed CDN URLs and proxy credentials never reach argv.
	playback := NewMediaPlayback(r)
	info, err := playback.add(map[string]playbackTrack{"video": track})
	if err != nil {
		return rawMediaFormat{}, err
	}
	defer playback.Remove(info.ID)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return rawMediaFormat{}, err
	}
	server := &http.Server{ReadHeaderTimeout: 3 * time.Second, BaseContext: func(net.Listener) context.Context { return ctx }, Handler: http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path != info.Video || (req.Method != "GET" && req.Method != "HEAD") {
			http.NotFound(w, req)
			return
		}
		playback.Serve(w, req, info.ID, "video")
	})}
	defer server.Close()
	go func() { _ = server.Serve(listener) }()
	name := "ffprobe"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	command := exec.CommandContext(ctx, filepath.Join(filepath.Dir(r.Binary), name), "-v", "error", "-rw_timeout", "8000000", "-protocol_whitelist", "http,tcp", "-format_whitelist", "mov,matroska,webm", "-probesize", "1048576", "-analyzeduration", "2000000", "-show_entries", "stream=codec_type,codec_name,width,height", "-of", "json", "http://"+listener.Addr().String()+info.Video)
	configureMediaCommand(command)
	command.WaitDelay = time.Second
	output := &cappedOutput{limit: 256 * 1024}
	command.Stdout = output
	if err := command.Run(); err != nil || output.overflow {
		return rawMediaFormat{}, errors.New("media track probe unavailable")
	}
	var raw struct {
		Streams []struct {
			Type   string `json:"codec_type"`
			Codec  string `json:"codec_name"`
			Width  int    `json:"width"`
			Height int    `json:"height"`
		} `json:"streams"`
	}
	if json.Unmarshal(output.Bytes(), &raw) != nil || len(raw.Streams) == 0 {
		return rawMediaFormat{}, errors.New("media probe returned no tracks")
	}
	result := rawMediaFormat{VCodec: "none", ACodec: "none"}
	for _, s := range raw.Streams {
		if s.Type == "video" {
			result.VCodec = s.Codec
			result.Width = s.Width
			result.Height = s.Height
		}
		if s.Type == "audio" {
			result.ACodec = s.Codec
		}
	}
	return result, nil
}
