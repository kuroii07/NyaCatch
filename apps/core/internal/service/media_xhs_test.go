package service

import (
	"strings"
	"testing"
)

func TestXhsImageCollection(t *testing.T) {
	source := "https://www.xiaohongshu.com/explore/6ae09439000000001f01697b?xsec_token=sample"
	doc := `{"_type":"playlist","entries":[{"id":"xhs-one","_nyacatch_resource_id":"xhs-one","_nyacatch_kind":"image","_nyacatch_resolver":"xiaohongshu-public","ext":"webp","thumbnail":"https://sns-webpic-qc.xhscdn.com/one"},{"id":"xhs-two","_nyacatch_resource_id":"xhs-two","_nyacatch_kind":"image","_nyacatch_resolver":"xiaohongshu-public","ext":"webp","thumbnail":"https://sns-webpic-qc.xhscdn.com/two"}]}`
	preview, err := ParseMediaPreview(strings.NewReader(doc), source)
	if err != nil || len(preview.Resources) != 2 || preview.Resources[1].ResourceID != "xhs-two" || preview.Resources[1].Resolver != "xiaohongshu-public" {
		t.Fatalf("invalid preview: %+v %v", preview, err)
	}
	if _, err := ParseMediaPreview(strings.NewReader(doc), "https://example.com/explore/6ae09439000000001f01697b"); err == nil {
		t.Fatal("accepted unrelated source")
	}
}
