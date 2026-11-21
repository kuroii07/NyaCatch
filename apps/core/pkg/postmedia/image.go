package postmedia

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// SaveImage checks the returned bytes, writes a temporary file and reserves the
// final filename with O_EXCL. An HTML login page can never become a saved photo.
func SaveImage(ctx context.Context, data []byte, dir, stem, proxy string, progress func(int64)) (string, error) {
	client, close, e := Client(proxy)
	if e != nil {
		return "", e
	}
	defer close()
	return saveImage(ctx, data, dir, stem, client, progress)
}

func saveImage(ctx context.Context, data []byte, dir, stem string, client *http.Client, progress func(int64)) (string, error) {
	var info struct {
		URL  string `json:"url"`
		Kind string `json:"_nyacatch_kind"`
	}
	if json.Unmarshal(data, &info) != nil || info.Kind != "image" {
		return "", errors.New("selected resource is not an original image")
	}
	u, e := url.Parse(info.URL)
	if e != nil || u.User != nil || u.Scheme != "https" || u.Port() != "" || !(u.Hostname() == "pbs.twimg.com" || CDNURL(info.URL) || XhsCDNURL(info.URL) || DouyinCDNURL(info.URL)) {
		return "", errors.New("unsupported original image source")
	}
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) > 3 || req.URL.Scheme != "https" || req.URL.User != nil || req.URL.Port() != "" || !(req.URL.Hostname() == "pbs.twimg.com" || CDNURL(req.URL.String()) || XhsCDNURL(req.URL.String()) || DouyinCDNURL(req.URL.String())) {
			return errors.New("unexpected image redirect")
		}
		return nil
	}
	req, e := http.NewRequestWithContext(ctx, "GET", info.URL, nil)
	if e != nil {
		return "", e
	}
	req.Header.Set("User-Agent", "NyaCatch/1")
	res, e := client.Do(req)
	if e != nil {
		return "", errors.New("original image download failed")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return "", errors.New("original image source rejected the request")
	}
	if res.ContentLength > 100*1024*1024 {
		return "", errors.New("original image exceeds 100 MiB")
	}
	reader := bufio.NewReader(io.LimitReader(res.Body, 100*1024*1024+1))
	head, _ := reader.Peek(512)
	ext := map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp"}[http.DetectContentType(head)]
	if ext == "" {
		return "", errors.New("source did not return a supported original image")
	}
	tmp, e := os.CreateTemp(dir, ".nyacatch-image-*.part")
	if e != nil {
		return "", e
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()
	buffer := make([]byte, 64*1024)
	var total int64
	for {
		if e = ctx.Err(); e != nil {
			return "", e
		}
		n, readErr := reader.Read(buffer)
		if n > 0 {
			total += int64(n)
			if total > 100*1024*1024 {
				return "", errors.New("original image exceeds 100 MiB")
			}
			if _, e = tmp.Write(buffer[:n]); e != nil {
				return "", e
			}
			if progress != nil {
				progress(total)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return "", readErr
		}
	}
	if total == 0 || (res.ContentLength >= 0 && total != res.ContentLength) {
		return "", errors.New("original image download is incomplete")
	}
	if e = ctx.Err(); e != nil {
		return "", e
	}
	if _, e = tmp.Seek(0, 0); e != nil {
		return "", e
	}
	if filepath.Base(stem) != stem || strings.ContainsAny(stem, "\\/") || stem == "" {
		return "", errors.New("invalid image filename")
	}
	target := filepath.Join(dir, stem+"."+ext)
	out, e := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if e != nil {
		return "", e
	}
	copied, e := io.Copy(out, tmp)
	closeErr := out.Close()
	if e != nil || closeErr != nil || copied != total || ctx.Err() != nil {
		os.Remove(target)
		return "", errors.New("image could not be finalized")
	}
	return target, nil
}
