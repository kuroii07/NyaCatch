// Package xmedia adapts a public X status response into a small, validated
// yt-dlp info document. It never accepts downloader options from the service.
package xmedia

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"
)

const Resolver = "x-public"
const maxJSON = 2 * 1024 * 1024

var statusPath = regexp.MustCompile(`^/(?:[A-Za-z0-9_]+|i/web)/status/([0-9]{15,22})(?:/(?:video|photo)/[1-9][0-9]*)?/?$`)

func StatusID(source string) (string, error) {
	u, err := url.Parse(source)
	if err != nil || u == nil || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.Port() != "" {
		return "", errors.New("a public X status link is required")
	}
	switch strings.ToLower(u.Hostname()) {
	case "x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com":
	default:
		return "", errors.New("a public X status link is required")
	}
	m := statusPath.FindStringSubmatch(u.EscapedPath())
	if m == nil {
		return "", errors.New("a single X status link is required")
	}
	return m[1], nil
}

func ShouldFallback(source, detail string) bool {
	if _, err := StatusID(source); err != nil {
		return false
	}
	detail = strings.ToLower(detail)
	for _, known := range []string{"no video could be found in this tweet", "unable to extract tweet", "unable to extract status", "unable to download json metadata"} {
		if strings.Contains(detail, known) {
			return true
		}
	}
	return false
}

type Client struct {
	HTTP          *http.Client
	Probe         func(context.Context, string) (ProbeInfo, error)
	InventoryOnly bool
}

func Fetch(ctx context.Context, source, binaryDir, proxy string) ([]byte, error) {
	return fetch(ctx, source, binaryDir, proxy, "", false, false)
}

func FetchCollection(ctx context.Context, source, binaryDir, proxy string) ([]byte, error) {
	return fetch(ctx, source, binaryDir, proxy, "", true, false)
}

func FetchInventory(ctx context.Context, source, binaryDir, proxy string) ([]byte, error) {
	return fetch(ctx, source, binaryDir, proxy, "", true, true)
}

func FetchResource(ctx context.Context, source, binaryDir, proxy, resource string) ([]byte, error) {
	return fetch(ctx, source, binaryDir, proxy, resource, true, false)
}

func fetch(ctx context.Context, source, binaryDir, proxy, resource string, collection, inventory bool) ([]byte, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if proxy != "" {
		u, err := url.Parse(proxy)
		if err != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https" && u.Scheme != "socks5" && u.Scheme != "socks5h") {
			return nil, errors.New("invalid media proxy")
		}
		transport.Proxy = http.ProxyURL(u)
	}
	defer transport.CloseIdleConnections()
	client := &Client{HTTP: &http.Client{Transport: transport, Timeout: 20 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 || len(via) == 0 || req.URL.Scheme != "https" || req.URL.User != nil || req.URL.Port() != "" || req.URL.Hostname() != via[0].URL.Hostname() {
			return errors.New("unexpected media redirect")
		}
		return nil
	}}}
	client.Probe = func(ctx context.Context, mediaURL string) (ProbeInfo, error) {
		return probeRemote(ctx, binaryDir, mediaURL, client.HTTP)
	}
	client.InventoryOnly = inventory
	if collection {
		return client.Collection(ctx, source, resource)
	}
	return client.Metadata(ctx, source)
}

func mediaURL(value, host string, video bool) bool {
	u, err := url.Parse(value)
	if err != nil || u == nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || strings.ToLower(u.Hostname()) != host {
		return false
	}
	ext := strings.ToLower(path.Ext(u.Path))
	if video {
		return ext == ".mp4"
	}
	return ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp"
}

type publicMedia struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	URL       string `json:"url"`
	Thumbnail string `json:"thumbnail_url"`
}

type publicStatus struct {
	ID     string `json:"id"`
	Text   string `json:"text"`
	Author struct {
		Name string `json:"name"`
	} `json:"author"`
	Media struct {
		Videos []publicMedia `json:"videos"`
		Photos []publicMedia `json:"photos"`
		All    []publicMedia `json:"all"`
	} `json:"media"`
}

func (c *Client) Metadata(ctx context.Context, source string) ([]byte, error) {
	id, err := StatusID(source)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	data, err := c.statusBytes(ctx, id)
	if err != nil {
		return nil, err
	}
	var result struct {
		Status *publicStatus `json:"status"`
		Tweet  *publicStatus `json:"tweet"`
	}
	if err = json.Unmarshal(data, &result); err != nil {
		return nil, errors.New("invalid public X response")
	}
	status := result.Status
	if status == nil {
		status = result.Tweet
	}
	if status == nil || status.ID != id {
		return nil, errors.New("public X response does not match the requested status")
	}
	if len(status.Media.Videos) != 1 {
		return nil, errors.New("public X route requires one video; no video or multiple videos were returned")
	}
	v := status.Media.Videos[0]
	info, err := c.videoInfo(ctx, source, status, v)
	if err != nil {
		return nil, err
	}
	return json.Marshal(info)
}

func (c *Client) videoInfo(ctx context.Context, source string, status *publicStatus, v publicMedia) (map[string]any, error) {
	id := status.ID
	if v.Type != "video" || !mediaURL(v.URL, "video.twimg.com", true) || (v.Thumbnail != "" && !mediaURL(v.Thumbnail, "pbs.twimg.com", false)) {
		return nil, errors.New("public X response contains unsupported media")
	}
	if c.Probe == nil {
		return nil, errors.New("media probe is unavailable")
	}
	p, err := c.Probe(ctx, v.URL)
	if err != nil {
		return nil, fmt.Errorf("public X video verification failed: %w", err)
	}
	if p.Width <= 0 || p.Height <= 0 || p.VideoCodec == "" || p.VideoCodec == "none" || p.AudioCodec == "" {
		return nil, errors.New("public X media tracks could not be verified")
	}
	title := strings.TrimSpace(status.Text)
	if title == "" {
		title = "X video " + id
	}
	// Keep captions bounded; never copy service-provided headers, extractor
	// instructions, playlists, file paths or postprocessors into the document.
	runes := []rune(title)
	if len(runes) > 180 {
		title = string(runes[:180])
	}
	format := map[string]any{"format_id": "x-public-best", "url": v.URL, "ext": "mp4", "protocol": "https", "width": p.Width, "height": p.Height, "fps": p.FPS, "vcodec": p.VideoCodec, "acodec": p.AudioCodec}
	info := map[string]any{"id": id, "title": title, "webpage_url": source, "original_url": source, "extractor": "NyaCatchXPublic", "extractor_key": "Twitter", "_nyacatch_resolver": Resolver, "ext": "mp4", "duration": p.Duration, "uploader": status.Author.Name, "formats": []any{format}, "vcodec": p.VideoCodec, "acodec": p.AudioCodec}
	if v.Thumbnail != "" {
		info["thumbnail"] = v.Thumbnail
		info["thumbnails"] = []any{map[string]any{"url": v.Thumbnail, "id": "cover"}}
	}
	return info, nil
}

func (c *Client) statusBytes(ctx context.Context, id string) ([]byte, error) {
	// Retry one interrupted connection or gateway failure within the same
	// deadline. Permission, rate-limit and invalid-data responses stay explicit.
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			timer := time.NewTimer(250 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return nil, ctx.Err()
			case <-timer.C:
			}
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		req, err := http.NewRequestWithContext(ctx, "GET", "https://api.fxtwitter.com/2/status/"+id, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", "NyaCatch/preview")
		resp, err := c.HTTP.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if attempt == 0 {
				continue
			}
			return nil, errors.New("public X service could not be reached after retry")
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			if attempt == 0 && (resp.StatusCode == 502 || resp.StatusCode == 503 || resp.StatusCode == 504) {
				continue
			}
			return nil, fmt.Errorf("public X service returned HTTP %d", resp.StatusCode)
		}
		data, readErr := io.ReadAll(io.LimitReader(resp.Body, maxJSON+1))
		resp.Body.Close()
		if len(data) > maxJSON {
			return nil, errors.New("public X response exceeds size limit")
		}
		if readErr != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if attempt == 0 {
				continue
			}
			return nil, errors.New("public X response could not be read after retry")
		}
		return data, nil
	}
	return nil, errors.New("public X response unavailable")
}
