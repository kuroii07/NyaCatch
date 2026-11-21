package service

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestXFallbackOnlyAfterEligiblePrimaryFailure(t *testing.T) {
	source := "https://x.com/a/status/2113612120076251186?s=20"
	const valid = `{"title":"clip","ext":"mp4","vcodec":"h264","acodec":"aac","_nyacatch_resolver":"x-public","formats":[{"format_id":"x-public-best","ext":"mp4","vcodec":"h264","acodec":"aac"}]}`
	for _, tc := range []struct {
		name, source, detail string
		fallback             bool
	}{
		{"primary success", source, "", false},
		{"public fallback", source, "No video could be found in this tweet", true},
		{"other platform", "https://youtube.com/watch?v=1", "No video could be found in this tweet", false},
		{"permission", source, "private tweet requires login", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			r := &MediaResolver{extract: func(context.Context, string, string) ([]byte, error) {
				if tc.detail != "" {
					return nil, errors.New(tc.detail)
				}
				return []byte(valid), nil
			}, public: func(context.Context, string, string, string) ([]byte, error) { calls++; return []byte(valid), nil }}
			p, err := r.Resolve(context.Background(), tc.source)
			if (calls == 1) != tc.fallback {
				t.Fatalf("fallback calls=%d", calls)
			}
			if tc.fallback && (err != nil || p.URL != source || p.Resolver != "x-public") {
				t.Fatalf("lost source or resolver: %+v %v", p, err)
			}
		})
	}
}

func TestXFallbackCancellationAndErrorDetails(t *testing.T) {
	source := "https://x.com/a/status/2113612120076251186"
	called := false
	r := &MediaResolver{extract: func(context.Context, string, string) ([]byte, error) {
		return nil, errors.New("No video could be found in this tweet")
	}, public: func(context.Context, string, string, string) ([]byte, error) {
		called = true
		return nil, errors.New("HTTP 503")
	}}
	_, err := r.Resolve(context.Background(), source)
	if err == nil || !strings.Contains(err.Error(), "No video") || !strings.Contains(err.Error(), "HTTP 503") {
		t.Fatalf("route causes lost: %v", err)
	}
	called = false
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = r.Resolve(ctx, source)
	if called || !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled parse fell back: %v %v", called, err)
	}
	called = false
	if _, err = r.metadataFor(context.Background(), "https://youtube.com/watch?v=1", "x-public"); err == nil || called {
		t.Fatal("public resolver accepted non-X playback")
	}
	_, err = r.metadataFor(context.Background(), source, "x-public")
	if !called || err == nil {
		t.Fatal("explicit playback route was not used")
	}
}
