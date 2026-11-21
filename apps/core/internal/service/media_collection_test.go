package service

import (
	"strings"
	"testing"
)

func TestFinitePostCollectionAndOriginalImagePreview(t *testing.T) {
	doc := `{"_type":"playlist","entries":[{"id":"100","_nyacatch_kind":"image","_nyacatch_resolver":"x-public","_nyacatch_resource_id":"x-image-100","title":"photo","ext":"png","thumbnail":"https://pbs.twimg.com/media/original.png"},{"id":"101","title":"video","ext":"mp4","vcodec":"h264","acodec":"aac"}]}`
	p, e := ParseMediaPreview(strings.NewReader(doc), "https://x.com/a/status/2113612120076251186")
	if e != nil || len(p.Resources) != 2 || p.Resources[0].Kind != "image" || !p.Resources[1].HasAudio || p.Resources[1].ResourceID != "yt-101" {
		t.Fatalf("invalid finite preview: %+v %v", p, e)
	}
	if p.URL != p.Resources[1].URL {
		t.Fatal("original source changed")
	}
	if _, e = ParseMediaPreview(strings.NewReader(doc), "https://youtube.com/playlist?list=1"); e == nil {
		t.Fatal("unrelated playlist expanded")
	}
	if _, e = ParseMediaPreview(strings.NewReader(strings.Replace(doc, `"id":"101"`, `"id":"100","_nyacatch_resource_id":"x-image-100"`, 1)), p.URL); e == nil {
		t.Fatal("duplicate resources accepted")
	}
}
