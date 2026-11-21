package service

import (
	"strings"
	"testing"
)

func TestDouyinVideoPreview(t *testing.T) {
	source := "https://v.douyin.com/ECM9CkNPp-E/"
	doc := `{"id":"7700577998572354746","_nyacatch_resource_id":"dy-7700577998572354746","_nyacatch_resolver":"douyin-browser","title":"video","ext":"mp4","formats":[{"format_id":"douyin-browser-best","ext":"mp4","vcodec":"h264","acodec":"aac","width":1280,"height":720}]}`
	p, err := ParseMediaPreview(strings.NewReader(doc), source)
	if err != nil || p.Resolver != "douyin-browser" || p.ResourceID != "dy-7700577998572354746" || !p.HasAudio || len(p.Formats) != 1 {
		t.Fatalf("unexpected preview: %+v %v", p, err)
	}
	if _, err = ParseMediaPreview(strings.NewReader(doc), "https://evil.test/video/7700577998572354746"); err == nil {
		t.Fatal("untrusted source accepted")
	}
	imageDoc := strings.Replace(doc, `"title":"video"`, `"title":"video","_nyacatch_kind":"image"`, 1)
	if _, err = ParseMediaPreview(strings.NewReader(imageDoc), source); err == nil {
		t.Fatal("video resolver accepted an image")
	}
}

func TestDouyinImagePreview(t *testing.T) {
	source := "https://www.douyin.com/note/7700577998572354746"
	doc := `{"_type":"playlist","entries":[{"id":"dyimg-one","_nyacatch_resource_id":"dyimg-one","_nyacatch_resolver":"douyin-browser","_nyacatch_kind":"image","url":"https://p3-sign.douyinpic.com/one"},{"id":"dyimg-two","_nyacatch_resource_id":"dyimg-two","_nyacatch_resolver":"douyin-browser","_nyacatch_kind":"image","url":"https://p9-sign.douyinpic.com/two"}]}`
	preview, err := ParseMediaPreview(strings.NewReader(doc), source)
	if err != nil || len(preview.Resources) != 2 || preview.Resources[0].Kind != "image" || preview.Resources[1].ResourceID != "dyimg-two" {
		t.Fatalf("unexpected image preview: %+v %v", preview, err)
	}
	if _, err := ParseMediaPreview(strings.NewReader(strings.ReplaceAll(doc, "p3-sign.douyinpic.com", "p3-sign.douyinpic.com.evil.test")), source); err == nil {
		t.Fatal("untrusted image metadata accepted")
	}
}
