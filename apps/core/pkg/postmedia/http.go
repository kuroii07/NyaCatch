package postmedia

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const InstagramResolver = "instagram-public"

func Client(proxy string) (*http.Client, func(), error) {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.ResponseHeaderTimeout = 15 * time.Second
	if proxy != "" {
		u, e := url.Parse(proxy)
		if e != nil || u.Hostname() == "" || !(u.Scheme == "http" || u.Scheme == "https" || u.Scheme == "socks5" || u.Scheme == "socks5h") {
			return nil, nil, errors.New("invalid media proxy")
		}
		t.Proxy = http.ProxyURL(u)
	}
	c := &http.Client{Transport: t, Timeout: 30 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if len(via) > 4 || r.URL.Scheme != "https" || r.URL.User != nil || r.URL.Port() != "" {
			return errors.New("unexpected media redirect")
		}
		if r.Header.Get("Referer") != "" && len(via) > 0 && r.URL.Hostname() != via[0].URL.Hostname() {
			r.Header.Del("Referer")
		}
		return nil
	}}
	return c, t.CloseIdleConnections, nil
}

func CDNURL(source string) bool {
	u, e := url.Parse(source)
	if e != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return false
	}
	h := strings.ToLower(u.Hostname())
	return strings.HasSuffix(h, ".cdninstagram.com") || strings.HasSuffix(h, ".fbcdn.net")
}
