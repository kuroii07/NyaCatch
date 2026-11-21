package service

import (
	"slices"
	"strings"
	"testing"
)

func TestPreviewUsesConfiguredProxyAsSingleArgument(t *testing.T) {
	proxy := "socks5://127.0.0.1:17890"
	args := MediaPreviewArguments("https://example.com/watch?list=a&v=b", proxy)
	index := slices.Index(args, "--proxy")
	if index < 0 || index+1 >= len(args) || args[index+1] != proxy {
		t.Fatalf("configured proxy omitted: %v", args)
	}
	if args[len(args)-2] != "--" || args[len(args)-1] != "https://example.com/watch?list=a&v=b" {
		t.Fatal("URL is not a separate argument after the option terminator")
	}
	if slices.Contains(MediaPreviewArguments("https://example.com/watch", ""), "--proxy") {
		t.Fatal("empty proxy differs from the legacy queue behavior")
	}
}

func TestMediaURLValidation(t *testing.T) {
	for _, input := range []string{"file:///C:/secret", "javascript:alert(1)", "--exec=bad", "https://user:password@example.com/video", "https://", ""} {
		if ValidateMediaURL(input) == nil {
			t.Errorf("accepted invalid URL %q", input)
		}
	}
	for _, input := range []string{"https://example.com/watch?v=a&b=c", "http://127.0.0.1:1234/中文.mp4"} {
		if err := ValidateMediaURL(input); err != nil {
			t.Errorf("rejected HTTP URL: %v", err)
		}
	}
}

func TestParseVideoPreview(t *testing.T) {
	source := "https://example.com/flower.mp4"
	result, err := ParseMediaPreview(strings.NewReader(`{"title":" Flower ","duration":5.2,"ext":"mp4","vcodec":"h264","acodec":"aac","thumbnail":"https://example.com/cover.jpg","url":"https://example.com/flower.mp4"}`), source)
	if err != nil {
		t.Fatal(err)
	}
	if result.Title != "Flower" || result.Kind != "video" || result.Extension != "mp4" || result.Duration != 5.2 || result.PreviewURL != source || result.Thumbnail == "" {
		t.Fatalf("incorrect preview: %+v", result)
	}
}

func TestAudioPreviewDoesNotOfferVideoOrUnsafeImage(t *testing.T) {
	result, err := ParseMediaPreview(strings.NewReader(`{"id":"track","ext":"m4a","vcodec":"none","acodec":"aac","thumbnail":"javascript:alert(1)","url":"https://other.example/stream"}`), "https://example.com/audio")
	if err != nil {
		t.Fatal(err)
	}
	if result.Kind != "audio" || result.Thumbnail != "" || result.PreviewURL != "" || result.Title != "track" {
		t.Fatalf("unsafe or misclassified audio: %+v", result)
	}
}

func TestPreviewRejectsPlaylistLiveAndUnknownMedia(t *testing.T) {
	for _, data := range []string{`{"_type":"playlist","entries":[]}`, `{"is_live":true,"vcodec":"h264"}`, `{"title":"webpage"}`, `{bad json}`} {
		if _, err := ParseMediaPreview(strings.NewReader(data), "https://example.com/watch"); err == nil {
			t.Errorf("accepted unsupported metadata: %s", data)
		}
	}
}

func TestPreviewInfersVideoFromFormats(t *testing.T) {
	result, err := ParseMediaPreview(strings.NewReader(`{"title":"clip","ext":"../exe","formats":[{"vcodec":"av01"}]}`), "https://example.com/watch")
	if err != nil {
		t.Fatal(err)
	}
	if result.Kind != "video" || result.Extension != "" {
		t.Fatalf("incorrect format inference: %+v", result)
	}
}

func TestDirectMediaWithoutCodecProbeStillResolves(t *testing.T) {
	for _, sample := range []struct{ ext, kind string }{{"mp4", "video"}, {"webm", "video"}, {"m4a", "audio"}, {"mp3", "audio"}} {
		metadata := `{"title":"direct","ext":"` + sample.ext + `","url":"https://example.com/media","formats":[{"format_id":"direct"}]}`
		preview, err := ParseMediaPreview(strings.NewReader(metadata), "https://example.com/media")
		if err != nil {
			t.Fatal(err)
		}
		if preview.Kind != sample.kind {
			t.Fatalf("got %s for %s", preview.Kind, sample.ext)
		}
	}
}
