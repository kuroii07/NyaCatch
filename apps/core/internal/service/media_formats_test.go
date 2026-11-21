package service

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPreviewPreservesRealFormatsWithoutSignedURLs(t *testing.T) {
	input := `{"title":"Clip","extractor_key":"BiliBili","uploader":"Author","duration":12,"ext":"mp4","formats":[
 {"format_id":"v1080","ext":"mp4","height":1080,"width":1920,"fps":60,"vcodec":"avc1","acodec":"none","filesize":12345,"url":"https://cdn.example/private?token=hidden"},
 {"format_id":"v1080-av1","ext":"mp4","height":1080,"vcodec":"av01","acodec":"none","filesize_approx":10000},
 {"format_id":"a1","ext":"m4a","vcodec":"none","acodec":"aac"},
 {"format_id":"sb0","ext":"mhtml","vcodec":"none","acodec":"none"},
 {"format_id":"--exec=bad","ext":"mp4","vcodec":"h264","acodec":"none"}]}`
	p, err := ParseMediaPreview(strings.NewReader(input), "https://www.bilibili.com/video/BVtest")
	if err != nil {
		t.Fatal(err)
	}
	if p.Source != "BiliBili" || p.Uploader != "Author" || !p.HasAudio || len(p.Formats) != 3 {
		t.Fatalf("lost useful metadata: %+v", p)
	}
	if p.Formats[0].Height != 1080 || p.Formats[0].FPS != 60 || p.Formats[0].Filesize != 12345 || p.Formats[0].Approximate {
		t.Fatalf("incorrect video format: %+v", p.Formats[0])
	}
	if !p.Formats[1].Approximate || !p.Formats[2].AudioOnly {
		t.Fatal("format classification lost")
	}
	data, _ := json.Marshal(p)
	if strings.Contains(string(data), "token=hidden") || strings.Contains(string(data), "--exec") {
		t.Fatal("preview leaked stream URLs or unsafe format IDs")
	}
}

func TestPreviewMixedStreamAndUnknownDuration(t *testing.T) {
	p, err := ParseMediaPreview(strings.NewReader(`{"title":"Mixed","ext":"mp4","duration":null,"formats":[{"format_id":"http-1","ext":"mp4","height":720,"vcodec":"h264","acodec":"aac"}]}`), "https://x.com/a/status/1")
	if err != nil {
		t.Fatal(err)
	}
	if !p.HasAudio || p.Duration != 0 || p.Source != "x.com" || p.Formats[0].AudioOnly {
		t.Fatalf("incorrect mixed stream: %+v", p)
	}
	p, err = ParseMediaPreview(strings.NewReader(`{"ext":"mp4","vcodec":"h264","acodec":"none"}`), "https://example.com/silent.mp4")
	if err != nil || p.HasAudio {
		t.Fatalf("silent video offers audio: %+v %v", p, err)
	}
}

func TestPreviewKeepsExplicitAudioOnlyFormatsWithUnknownCodec(t *testing.T) {
	p, err := ParseMediaPreview(strings.NewReader(`{"ext":"mp4","formats":[
 {"format_id":"hls-audio-128000-Audio","ext":"mp4","vcodec":"none","acodec":null},
 {"format_id":"hls-720","ext":"mp4","height":720,"vcodec":"avc1.64001f","acodec":"none"}]}`), "https://x.com/example/status/1")
	if err != nil {
		t.Fatal(err)
	}
	if !p.HasAudio || len(p.Formats) != 2 || !p.Formats[0].AudioOnly || p.Formats[0].AudioCodec != "" {
		t.Fatalf("explicit audio-only track lost or codec invented: %+v", p)
	}
}
