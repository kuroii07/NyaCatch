package postmedia

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type imageTransport func(*http.Request) (*http.Response, error)

func (f imageTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSaveImageUsesRealFormatAndProtectsExistingFiles(t *testing.T) {
	var b bytes.Buffer
	png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 10, 20)))
	data := b.Bytes()
	dir := t.TempDir()
	client := &http.Client{Transport: imageTransport(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, ContentLength: int64(len(data)), Body: io.NopCloser(bytes.NewReader(data)), Header: http.Header{}}, nil
	})}
	info := []byte(`{"url":"https://pbs.twimg.com/media/file.jpg","_nyacatch_kind":"image"}`)
	out, e := saveImage(context.Background(), info, dir, "原图", client, nil)
	if e != nil || filepath.Ext(out) != ".png" {
		t.Fatal("real PNG labeled JPEG", out, e)
	}
	original, _ := os.ReadFile(out)
	if !bytes.Equal(original, data) {
		t.Fatal("image bytes changed")
	}
	if _, e = saveImage(context.Background(), info, dir, "原图", client, nil); e == nil {
		t.Fatal("existing image overwritten")
	}
	data = []byte("<html>Login required</html>")
	if _, e = saveImage(context.Background(), info, dir, "login", client, nil); e == nil {
		t.Fatal("HTML saved as photo")
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatal("partial files leaked")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e = saveImage(ctx, info, dir, "cancel", client, nil); e == nil {
		t.Fatal("cancelled image reported success")
	}
	if _, e = saveImage(context.Background(), []byte(strings.Replace(string(info), "pbs.twimg.com", "pbs.twimg.com.evil.test", 1)), dir, "unsafe", client, nil); e == nil {
		t.Fatal("untrusted image host accepted")
	}
}

func TestDouyinImageDownloadPreservesBytesAndRejectsExternalRedirects(t *testing.T) {
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 8, 6))); err != nil {
		t.Fatal(err)
	}
	content := encoded.Bytes()
	client := &http.Client{Transport: imageTransport(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path == "/redirect" {
			return &http.Response{StatusCode: http.StatusFound, Body: io.NopCloser(strings.NewReader("")), Header: http.Header{"Location": []string{"https://untrusted.test/image"}}}, nil
		}
		if request.URL.Hostname() != "p3-sign.douyinpic.com" {
			t.Fatal("request escaped the image CDN")
		}
		return &http.Response{StatusCode: http.StatusOK, ContentLength: int64(len(content)), Body: io.NopCloser(bytes.NewReader(content)), Header: http.Header{}}, nil
	})}
	dir := t.TempDir()
	output, err := saveImage(context.Background(), []byte(`{"url":"https://p3-sign.douyinpic.com/image.jpg?signature=sample","_nyacatch_kind":"image"}`), dir, "selected", client, nil)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := os.ReadFile(output)
	if err != nil || !bytes.Equal(actual, content) || filepath.Ext(output) != ".png" {
		t.Fatal("image format or bytes changed")
	}
	if _, err = saveImage(context.Background(), []byte(`{"url":"https://p3-sign.douyinpic.com/redirect","_nyacatch_kind":"image"}`), dir, "redirect", client, nil); err == nil {
		t.Fatal("external image redirect accepted")
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatal("failed redirect left an output")
	}
}
