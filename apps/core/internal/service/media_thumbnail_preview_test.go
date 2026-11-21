package service

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPreviewThumbnailsUseProxySessionAndRelease(t *testing.T) {
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte("original-image"))
	}))
	defer origin.Close()
	service := NewMediaPlayback(&MediaResolver{})
	p := &MediaPreview{Thumbnail: origin.URL + "/image.png?signature=private", Resources: []MediaPreview{{Thumbnail: origin.URL + "/second.png"}}}
	original := p.Thumbnail
	service.AttachThumbnails(p)
	if p.PreviewSession == "" || p.Thumbnail != original || strings.Contains(p.DisplayThumbnail, "signature") || p.Resources[0].DisplayThumbnail == "" {
		t.Fatal("thumbnail identity/capability lost")
	}
	rec := httptest.NewRecorder()
	service.Serve(rec, httptest.NewRequest("GET", p.DisplayThumbnail, nil), p.PreviewSession, "thumb-0")
	if rec.Code != 200 || rec.Body.String() != "original-image" {
		t.Fatalf("preview image proxy failed: %d", rec.Code)
	}
	service.Remove(p.PreviewSession)
	rec = httptest.NewRecorder()
	service.Serve(rec, httptest.NewRequest("GET", p.DisplayThumbnail, nil), p.PreviewSession, "thumb-0")
	if rec.Code != 410 {
		t.Fatal("released image session remained readable")
	}
}
