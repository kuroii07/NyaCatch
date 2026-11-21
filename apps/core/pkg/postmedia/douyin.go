package postmedia

import (
	"context"
	"errors"
	"net/url"
	"regexp"
)

const DouyinResolver = "douyin-browser"

var douyinVideo = regexp.MustCompile(`^/(?:video|note)/[0-9]{15,25}/?$`)
var douyinShort = regexp.MustCompile(`^/[A-Za-z0-9_-]{4,64}/?$`)
var douyinImageHost = regexp.MustCompile(`^p[0-9]+(?:-pc)?-sign\.douyinpic\.com$`)

func DouyinCDNURL(source string) bool {
	u, err := url.Parse(source)
	return err == nil && u.Scheme == "https" && u.User == nil && u.Port() == "" && douyinImageHost.MatchString(u.Hostname())
}

func ValidateDouyinSource(source string) error {
	u, err := url.Parse(source)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return errors.New("invalid Douyin source")
	}
	if u.Host == "www.douyin.com" && douyinVideo.MatchString(u.EscapedPath()) {
		return nil
	}
	if u.Host == "v.douyin.com" && douyinShort.MatchString(u.EscapedPath()) {
		return nil
	}
	return errors.New("a single Douyin post is required")
}

func ExtractDouyin(ctx context.Context, source, proxy string) ([]byte, error) {
	if err := ValidateDouyinSource(source); err != nil {
		return nil, err
	}
	return extractBrowser(ctx, source, proxy, "Douyin")
}
