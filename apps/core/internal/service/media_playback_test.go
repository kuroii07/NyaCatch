package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPlaybackSelectsSplitTracksWithoutExposingSignedURLs(t *testing.T) {
	data := []byte(`{"title":"Clip","ext":"mp4","formats":[
 {"format_id":"v","url":"https://cdn.example/video?secret=signed","ext":"mp4","protocol":"https","height":720,"vcodec":"avc1.64001f","acodec":"none","http_headers":{"Referer":"https://example.com/"}},
 {"format_id":"a","url":"https://cdn.example/audio?secret=signed","ext":"m4a","protocol":"https","vcodec":"none","acodec":"mp4a.40.2"}]}`)
	tracks, err := playbackTracks(data, "https://example.com/watch", "video")
	if err != nil || len(tracks) != 2 {
		t.Fatalf("split playback: %v %+v", err, tracks)
	}
	if tracks["video"].Headers["Referer"] != "https://example.com/" {
		t.Fatal("required source header lost")
	}
	s := NewMediaPlayback(nil)
	result, err := s.add(tracks)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(result)
	if strings.Contains(string(b), "signed") || strings.Contains(string(b), "cdn.example") {
		t.Fatal("signed URL exposed")
	}
	if result.Video == "" || result.Audio == "" {
		t.Fatal("missing stream paths")
	}
}

func TestPlaybackAudioAndUnsupportedSources(t *testing.T) {
	for _, ext := range []string{"mp3", "m4a", "wav"} {
		tracks, err := playbackTracks([]byte(`{"ext":"`+ext+`","url":"https://example.com/track.`+ext+`"}`), "https://example.com/track."+ext, "audio")
		if err != nil || len(tracks) != 1 || tracks["audio"].URL == "" {
			t.Fatalf("direct audio %s: %v", ext, err)
		}
	}
	for _, data := range []string{
		`{"ext":"mp4","vcodec":"h264","url":"file:///private"}`,
		`{"ext":"mp4","vcodec":"h264","protocol":"m3u8_native","url":"https://example.com/master.m3u8"}`,
		`{"is_live":true,"ext":"mp4","vcodec":"h264","url":"https://example.com/v.mp4"}`,
		`{"ext":"mp4","vcodec":"h264","has_drm":true,"url":"https://example.com/v.mp4"}`,
	} {
		if _, err := playbackTracks([]byte(data), "https://example.com/watch", "video"); err == nil {
			t.Fatalf("unsupported source accepted: %s", data)
		}
	}
	// A video with known audio must not become a silent preview.
	if _, err := playbackTracks([]byte(`{"ext":"mp4","acodec":"aac","formats":[{"url":"https://example.com/v.mp4","ext":"mp4","vcodec":"h264","acodec":"none"}]}`), "https://example.com/watch", "video"); err == nil {
		t.Fatal("lost known audio")
	}
}

func TestPlaybackProgressiveVideoWithMissingCodecMetadata(t *testing.T) {
	for _, hasAudio := range []bool{false, true} {
		codec := "none"
		if hasAudio {
			codec = "mp4a.40.2"
		}
		data := []byte(`{"ext":"mp4","formats":[
 {"format_id":"http-1280","ext":"mp4","protocol":"https","height":720,"url":"https://cdn.example/720.mp4","vcodec":null,"acodec":null},
 {"format_id":"hls-720","ext":"mp4","protocol":"m3u8_native","height":720,"url":"https://cdn.example/master.m3u8","vcodec":"avc1.640020","acodec":"` + codec + `"}]}`)
		tracks, err := playbackTracks(data, "https://x.com/example/status/1", "video")
		if err != nil || tracks["video"].URL != "https://cdn.example/720.mp4" {
			t.Fatalf("progressive format with dimensions rejected: %v", err)
		}
		audio, err := playbackTracks(data, "https://x.com/example/status/1", "audio")
		if hasAudio && (err != nil || audio["audio"].URL != "https://cdn.example/720.mp4") {
			t.Fatalf("audio in progressive stream not offered: %v", err)
		}
		if !hasAudio && err == nil {
			t.Fatal("invented audio for a silent source")
		}
	}
}

func TestPlaybackRangeHeadersCancellationAndExpiry(t *testing.T) {
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Referer") != "https://example.com/watch" || r.Header.Get("Range") != "bytes=2-5" {
			t.Error("forwarded headers missing")
		}
		w.Header().Set("Content-Range", "bytes 2-5/10")
		w.Header().Set("Accept-Ranges", "bytes")
		w.Header().Set("Content-Type", "video/mp4")
		w.WriteHeader(206)
		_, _ = w.Write([]byte("2345"))
	}))
	defer remote.Close()
	s := NewMediaPlayback(nil)
	result, err := s.add(map[string]playbackTrack{"video": {URL: remote.URL, Extension: "mp4", Headers: map[string]string{"Referer": "https://example.com/watch"}}})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", result.Video, nil)
	req.Header.Set("Range", "bytes=2-5")
	out := httptest.NewRecorder()
	s.Serve(out, req, result.ID, "video")
	if out.Code != 206 || out.Body.String() != "2345" || out.Header().Get("Content-Range") != "bytes 2-5/10" {
		t.Fatalf("bad range response: %d %v %s", out.Code, out.Header(), out.Body)
	}
	s.Remove(result.ID)
	out = httptest.NewRecorder()
	s.Serve(out, req, result.ID, "video")
	if out.Code != 410 {
		t.Fatal("removed session served")
	}
	result, _ = s.add(map[string]playbackTrack{"video": {URL: remote.URL, Extension: "mp4"}})
	s.mu.Lock()
	s.sessions[result.ID].expires = time.Now().Add(-time.Second)
	s.mu.Unlock()
	out = httptest.NewRecorder()
	s.Serve(out, req, result.ID, "video")
	if out.Code != 410 {
		t.Fatal("expired session served")
	}
}

func TestPlaybackDisconnectCancelsUpstream(t *testing.T) {
	started, cancelled := make(chan struct{}), make(chan struct{})
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(started); <-r.Context().Done(); close(cancelled) }))
	defer remote.Close()
	s := NewMediaPlayback(nil)
	p, _ := s.add(map[string]playbackTrack{"audio": {URL: remote.URL, Extension: "m4a"}})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan struct{})
	go func() {
		defer close(done)
		s.Serve(httptest.NewRecorder(), httptest.NewRequest("GET", p.Audio, nil).WithContext(ctx), p.ID, "audio")
	}()
	<-started
	s.Remove(p.ID)
	select {
	case <-cancelled:
	case <-time.After(3 * time.Second):
		t.Fatal("upstream was not cancelled")
	}
	<-done
}
