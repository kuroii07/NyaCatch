package xmedia

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

type transportFunc func(*http.Request) (*http.Response, error)

type truncatedReader struct{ *strings.Reader }

func (r truncatedReader) Read(p []byte) (int, error) {
	n, err := r.Reader.Read(p)
	if r.Len() == 0 {
		return n, io.ErrUnexpectedEOF
	}
	return n, err
}

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

const fixture = `{"status":{"id":"2113612120076251186","text":"public clip","author":{"name":"Author"},"media":{"videos":[{"type":"video","url":"https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/1920x1080/clip.mp4?tag=1","thumbnail_url":"https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/cover.jpg","width":1920,"height":1080,"duration":67.1}]}}}`
const sourceURL = "https://x.com/axunkaOri/status/2113612120076251186?s=20"

func fixtureClient(body string, audio bool) *Client {
	return &Client{HTTP: &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://api.fxtwitter.com/2/status/2113612120076251186" || r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" {
			panic("unexpected request or credentials")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{"Content-Type": {"application/json"}}}, nil
	})}, Probe: func(context.Context, string) (ProbeInfo, error) {
		a := "none"
		if audio {
			a = "aac"
		}
		return ProbeInfo{Width: 1920, Height: 1080, Duration: 67.1, FPS: 30, VideoCodec: "h264", AudioCodec: a}, nil
	}}
}

func TestPublicMetadataPreservesSourceAndRealTracks(t *testing.T) {
	for _, audio := range []bool{true, false} {
		data, err := fixtureClient(fixture, audio).Metadata(context.Background(), sourceURL)
		if err != nil {
			t.Fatal(err)
		}
		var info struct {
			Original string `json:"webpage_url"`
			Resolver string `json:"_nyacatch_resolver"`
			Formats  []struct {
				ID    string `json:"format_id"`
				Audio string `json:"acodec"`
				Video string `json:"vcodec"`
			} `json:"formats"`
		}
		if err := json.Unmarshal(data, &info); err != nil {
			t.Fatal(err)
		}
		if info.Original != sourceURL || info.Resolver != Resolver || len(info.Formats) != 1 || info.Formats[0].ID != "x-public-best" || info.Formats[0].Video != "h264" {
			t.Fatalf("unexpected metadata: %s", data)
		}
		if (info.Formats[0].Audio == "aac") != audio {
			t.Fatal("audio was invented or lost")
		}
	}
}

func TestPublicServiceRetriesOnlyTransientFailures(t *testing.T) {
	for _, firstStatus := range []int{0, 503, 403} {
		c := fixtureClient(fixture, true)
		calls := 0
		c.HTTP.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
			calls++
			if calls == 1 {
				if firstStatus == 0 {
					return nil, io.ErrUnexpectedEOF
				}
				return &http.Response{StatusCode: firstStatus, Body: io.NopCloser(strings.NewReader("unavailable")), Header: make(http.Header)}, nil
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(fixture)), Header: make(http.Header)}, nil
		})
		_, err := c.Metadata(context.Background(), sourceURL)
		if firstStatus == 403 {
			if err == nil || calls != 1 {
				t.Fatal("permanent response retried")
			}
		} else if err != nil || calls != 2 {
			t.Fatalf("transient failure was not retried: calls=%d err=%v", calls, err)
		}
	}
}

func TestOversizedTruncatedResponseIsNotRetried(t *testing.T) {
	c := fixtureClient(fixture, true)
	calls := 0
	c.HTTP.Transport = transportFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 200, Body: io.NopCloser(truncatedReader{strings.NewReader(strings.Repeat("x", maxJSON+1))}), Header: make(http.Header)}, nil
	})
	if _, err := c.Metadata(context.Background(), sourceURL); err == nil || calls != 1 {
		t.Fatalf("oversized truncated response retried: calls=%d err=%v", calls, err)
	}
}

func TestPublicMetadataRejectsMismatchedOrUnsafeResponses(t *testing.T) {
	for _, body := range []string{
		strings.Replace(fixture, `"id":"2113612120076251186"`, `"id":"1111111111111111111"`, 1),
		strings.Replace(fixture, "https://video.twimg.com/", "https://video.twimg.com.evil.test/", 1),
		strings.Replace(fixture, "https://pbs.twimg.com/", "http://127.0.0.1/", 1),
		strings.Replace(fixture, "clip.mp4?tag=1", "clip.m3u8", 1),
		`{"status":{"id":"2113612120076251186","media":{"videos":[]}}}`,
		strings.Repeat("x", 2*1024*1024+1),
	} {
		if _, err := fixtureClient(body, true).Metadata(context.Background(), sourceURL); err == nil {
			t.Fatal("accepted unsafe response")
		}
	}
}

func TestStatusIDAndFallbackEligibility(t *testing.T) {
	for _, input := range []string{sourceURL, "https://twitter.com/a/status/2113612120076251186/video/1", "https://x.com/i/status/2113612120076251186"} {
		if id, err := StatusID(input); err != nil || id != "2113612120076251186" {
			t.Fatalf("rejected status: %s %v", input, err)
		}
	}
	for _, input := range []string{"https://x.com.evil.test/a/status/2113612120076251186", "https://x.com:444/a/status/2113612120076251186", "https://user@x.com/a/status/2113612120076251186", "https://x.com/a/status/123/../2113612120076251186", "https://x.com/a", "https://youtube.com/watch?v=1"} {
		if _, err := StatusID(input); err == nil {
			t.Fatalf("accepted invalid status %s", input)
		}
	}
	if !ShouldFallback(sourceURL, "No video could be found in this tweet") || ShouldFallback("https://youtube.com/watch?v=1", "No video could be found in this tweet") || ShouldFallback(sourceURL, "private tweet requires login") {
		t.Fatal("incorrect fallback boundary")
	}
}

func TestProbeParsingRequiresActualVideo(t *testing.T) {
	p, err := parseProbe([]byte(`{"streams":[{"codec_type":"video","codec_name":"h264","width":1920,"height":1080,"avg_frame_rate":"30000/1001"}],"format":{"duration":"67.1"}}`))
	if err != nil || p.AudioCodec != "none" || p.Width != 1920 || p.FPS < 29.9 {
		t.Fatalf("bad probe: %+v %v", p, err)
	}
	if _, err := parseProbe([]byte(`{"streams":[{"codec_type":"audio","codec_name":"aac"}]}`)); err == nil {
		t.Fatal("audio-only response accepted as a video")
	}
	if _, err := parseProbe([]byte(`{"streams":[{"codec_type":"video","codec_name":"h264","width":10,"height":10},{"codec_type":"audio"}],"format":{"duration":"1"}}`)); err == nil {
		t.Fatal("unidentified audio treated as silent")
	}
}
