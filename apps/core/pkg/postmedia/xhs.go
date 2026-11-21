package postmedia

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"time"
)

const XhsResolver = "xiaohongshu-public"

var xhsPath = regexp.MustCompile(`^/(?:explore|discovery/item)/([a-f0-9]{24})/?$`)
var xhsShortPath = regexp.MustCompile(`^/(?:[aAoO]/)?[A-Za-z0-9_-]{4,64}/?$`)

func XhsID(source string) (string, error) {
	u, err := url.Parse(source)
	if err == nil && (u.Scheme == "https" || u.Scheme == "http") && (u.Host == "xhslink.com" || u.Host == "xhslink.cn") && u.User == nil && xhsShortPath.MatchString(u.EscapedPath()) {
		return "", nil
	}
	if err != nil || u.Scheme != "https" || u.Host != "www.xiaohongshu.com" || u.User != nil {
		return "", errors.New("a single Xiaohongshu post is required")
	}
	m := xhsPath.FindStringSubmatch(u.EscapedPath())
	if m == nil {
		return "", errors.New("a single Xiaohongshu post is required")
	}
	return m[1], nil
}

func XhsCDNURL(source string) bool {
	u, err := url.Parse(source)
	return err == nil && u.Scheme == "https" && u.Host == "sns-webpic-qc.xhscdn.com" && u.User == nil
}

// The capability is passed to the core only by its Electron parent. Neither
// the signed post URL nor the ephemeral image URLs are logged here.
func ExtractXhs(ctx context.Context, source, proxy string) ([]byte, error) {
	if _, err := XhsID(source); err != nil {
		return nil, err
	}
	return extractBrowser(ctx, source, proxy, "Xiaohongshu")
}

func extractBrowser(ctx context.Context, source, proxy, platform string) ([]byte, error) {
	endpoint, secret := os.Getenv("NYACATCH_XHS_BRIDGE"), os.Getenv("NYACATCH_XHS_SECRET")
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.Port() == "" || u.Path != "/resolve" || u.User != nil || len(secret) != 64 {
		return nil, errors.New(platform + " browser helper unavailable")
	}
	payload, err := json.Marshal(map[string]string{"source": source, "proxy": proxy})
	if err != nil {
		return nil, errors.New("invalid post request")
	}
	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, errors.New("invalid browser helper request")
	}
	req.Header.Set("Authorization", "Bearer "+secret)
	req.Header.Set("Content-Type", "application/json")
	transport := &http.Transport{Proxy: nil, ResponseHeaderTimeout: 40 * time.Second}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("unexpected browser helper redirect") }}
	res, err := client.Do(req)
	if err != nil {
		return nil, errors.New(platform + " browser helper failed")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var result struct {
			Reason string `json:"reason"`
		}
		_ = json.NewDecoder(io.LimitReader(res.Body, 1024)).Decode(&result)
		switch result.Reason {
		case "navigate", "redirect", "extract", "normalize", "normalize-cdn", "normalize-image", "normalize-duplicate":
			return nil, errors.New(platform + " post unavailable at " + result.Reason)
		}
		return nil, errors.New(platform + " post unavailable in anonymous session")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, 4*1024*1024+1))
	if err != nil || len(data) > 4*1024*1024 {
		return nil, errors.New("invalid post metadata size")
	}
	return data, nil
}
