package service

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestParseProgressAndSeparateFailures(t *testing.T) {
	var stages []string
	ctx := WithMediaParseProgress(context.Background(), func(stage string) { stages = append(stages, stage) })
	r := &MediaResolver{
		extract: func(context.Context, string, string) ([]byte, error) {
			return nil, errors.New("No video could be found in this tweet")
		},
		public: func(context.Context, string, string, string) ([]byte, error) {
			if !reflect.DeepEqual(stages, []string{"fallback"}) {
				t.Fatal("Fallback must be announced before it starts", stages)
			}
			return nil, errors.New("public X service returned HTTP 503")
		},
	}
	_, err := r.Resolve(ctx, "https://x.com/example/status/2115248476414210365?s=20")
	details := MediaParseFailureDetails(err)
	if len(details.Attempts) != 2 || details.Attempts[0].Kind != "unavailable" || details.Attempts[1].Kind != "service" || details.Attempts[1].Route != "fallback" {
		t.Fatalf("Causes lost: %+v", details)
	}
	stages = nil
	r.extract = func(context.Context, string, string) ([]byte, error) {
		return nil, errors.New("private tweet requires login")
	}
	_, err = r.Resolve(ctx, "https://x.com/example/status/2115248476414210365")
	if len(stages) != 0 || len(MediaParseFailureDetails(err).Attempts) != 1 {
		t.Fatal("Restricted posts must not start a fallback")
	}
}

func TestParseKindsAndContextIsolation(t *testing.T) {
	for message, expected := range map[string]string{
		"context deadline exceeded": "timeout", "public X service returned HTTP 429": "rate-limit",
		"public X service returned HTTP 403": "restricted", "public X service could not be reached after retry": "network",
		"public X video verification failed: ffprobe could not verify the public MP4": "verification",
		"invalid public X response": "service", "unexpected state": "unknown",
	} {
		if got := mediaParseKind(message); got != expected {
			t.Errorf("%s: %s != %s", message, got, expected)
		}
	}
	calls := 0
	ctx, cancel := context.WithCancel(WithMediaParseProgress(context.Background(), func(string) { calls++ }))
	mediaParseProgress(context.Background(), "fallback")
	mediaParseProgress(ctx, "fallback")
	cancel()
	mediaParseProgress(ctx, "fallback")
	if calls != 1 {
		t.Fatal("Progress leaked or continued after cancellation", calls)
	}
}
