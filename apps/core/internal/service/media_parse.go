package service

import (
	"context"
	"errors"
	"strings"
)

type parseProgressKey struct{}

// Progress stays on this request; another window never receives its source or errors.
func WithMediaParseProgress(ctx context.Context, notify func(string)) context.Context {
	return context.WithValue(ctx, parseProgressKey{}, notify)
}

func mediaParseProgress(ctx context.Context, stage string) {
	if notify, ok := ctx.Value(parseProgressKey{}).(func(string)); ok && ctx.Err() == nil {
		notify(stage)
	}
}

type MediaParseAttempt struct {
	Route   string `json:"route"`
	Kind    string `json:"kind"`
	Message string `json:"message"`
}

type MediaParseFailure struct {
	Attempts []MediaParseAttempt `json:"attempts"`
}

type mediaParseError struct {
	primary, fallback error
}

func (e *mediaParseError) Error() string {
	return e.primary.Error() + "; anonymous X fallback failed: " + e.fallback.Error()
}
func (e *mediaParseError) Unwrap() error { return e.primary }

func mediaParseKind(message string) string {
	m := strings.ToLower(message)
	contains := func(terms ...string) bool {
		for _, term := range terms {
			if strings.Contains(m, term) {
				return true
			}
		}
		return false
	}
	switch {
	case contains("deadline exceeded", "timed out", "timeout"):
		return "timeout"
	case contains("http 429", "too many requests", "rate limit", "rate-limit"):
		return "rate-limit"
	case contains("http 401", "http 403", "private tweet", "requires login", "sign in", "not authorized"):
		return "restricted"
	case contains("http 502", "http 503", "http 504", "invalid public x response", "response does not match", "response exceeds"):
		return "service"
	case contains("could not be reached", "could not be read", "connection", "network", "tls", "proxy", "dns"):
		return "network"
	case contains("verification failed", "tracks could not be verified", "ffprobe"):
		return "verification"
	case contains("no video could be found", "http 404", "no supported resources", "unavailable", "unsupported media", "unsupported photo"):
		return "unavailable"
	default:
		return "unknown"
	}
}

func MediaParseFailureDetails(err error) MediaParseFailure {
	var combined *mediaParseError
	if errors.As(err, &combined) {
		return MediaParseFailure{Attempts: []MediaParseAttempt{
			{Route: "primary", Kind: mediaParseKind(combined.primary.Error()), Message: combined.primary.Error()},
			{Route: "fallback", Kind: mediaParseKind(combined.fallback.Error()), Message: combined.fallback.Error()},
		}}
	}
	return MediaParseFailure{Attempts: []MediaParseAttempt{{Route: "primary", Kind: mediaParseKind(err.Error()), Message: err.Error()}}}
}
