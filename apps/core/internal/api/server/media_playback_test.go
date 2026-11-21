package server

import (
	"net/http/httptest"
	"strings"
	"testing"

	"caorushizi.cn/mediago/internal/core"
	"caorushizi.cn/mediago/internal/logger"
	"go.uber.org/zap"
)

type playbackTestConfig map[string]any

func (c playbackTestConfig) Get(k string) any          { return c[k] }
func (c playbackTestConfig) Set(k string, v any) error { c[k] = v; return nil }
func (c playbackTestConfig) Update(values map[string]any) error {
	for k, v := range values {
		c[k] = v
	}
	return nil
}
func (c playbackTestConfig) Store() any { return c }

func TestPlaybackCreationAndRemovalStillRequireAuthentication(t *testing.T) {
	previous := logger.Logger
	logger.Logger = zap.NewNop()
	t.Cleanup(func() { logger.Logger = previous })
	s := New(core.NewTaskQueue(nil, 1), nil, nil, playbackTestConfig{"apiKey": "isolated-key", "language": "en"}, Options{EnableAuth: true})
	for _, sample := range []struct {
		method, path, body, key string
		want                    int
	}{
		{"POST", "/api/media/playback", `{"url":"https://example.com/a.mp4","mode":"video"}`, "", 401},
		{"POST", "/api/media/collection", `{"url":"https://www.youtube.com/playlist?list=PLexample","page":1}`, "", 401},
		{"POST", "/api/media/collection", `{"url":"https://www.youtube.com/playlist?list=PLexample","page":2001}`, "isolated-key", 400},
		{"POST", "/api/media/playback", `{"url":"https://example.com/a.mp4","mode":"invalid"}`, "isolated-key", 400},
		{"DELETE", "/api/media/playback/unknown", "", "", 401},
		{"DELETE", "/api/media/playback/unknown", "", "isolated-key", 200},
		// The stream route requires its unpredictable, scoped capability; a made-up one cannot read media.
		{"GET", "/api/media/playback/unknown/video", "", "", 410},
		{"HEAD", "/api/media/playback/unknown/audio", "", "", 410},
	} {
		r := httptest.NewRequest(sample.method, sample.path, strings.NewReader(sample.body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-API-Key", sample.key)
		w := httptest.NewRecorder()
		s.Engine().ServeHTTP(w, r)
		if w.Code != sample.want {
			t.Fatalf("%s %s: %d, wanted %d", sample.method, sample.path, w.Code, sample.want)
		}
	}
}
