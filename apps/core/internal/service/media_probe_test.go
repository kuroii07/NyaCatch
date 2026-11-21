package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestResolverProbesUnknownProgressiveTracks(t *testing.T) {
	const input = `{"title":"legacy MP4","ext":"mp4","height":360,"url":"https://cdn.example/clip.mp4","http_headers":{"Referer":"https://www.bilibili.com/"},"formats":[{"format_id":"16","ext":"mp4","height":360,"protocol":"https","url":"https://cdn.example/clip.mp4"}]}`
	for _, audio := range []string{"aac", "none"} {
		t.Run(audio, func(t *testing.T) {
			calls := 0
			r := &MediaResolver{extract: func(context.Context, string, string) ([]byte, error) { return []byte(input), nil }, probe: func(_ context.Context, track playbackTrack) (rawMediaFormat, error) {
				calls++
				if track.URL != "https://cdn.example/clip.mp4" || track.Headers["Referer"] != "https://www.bilibili.com/" {
					t.Fatal("probe lost target or source headers")
				}
				return rawMediaFormat{VCodec: "h264", ACodec: audio, Width: 640, Height: 360}, nil
			}}
			data, err := r.metadata(context.Background(), "https://www.bilibili.com/video/BVtest")
			if err != nil {
				t.Fatal(err)
			}
			p, err := r.Resolve(context.Background(), "https://www.bilibili.com/video/BVtest")
			if err != nil || p.HasAudio != (audio != "none") || len(p.Formats) != 1 || p.Formats[0].AudioCodec != audio {
				t.Fatalf("real track information lost: %+v %v", p, err)
			}
			if calls != 2 {
				t.Fatalf("same stream probed more than once per extraction: %d", calls)
			}
			tracks, err := playbackTracks(data, p.URL, "audio")
			if audio == "aac" && (err != nil || tracks["audio"].URL == "") {
				t.Fatalf("audio preview unavailable: %v", err)
			}
			if audio == "none" && err == nil {
				t.Fatal("silent video offered audio")
			}
			out, _ := json.Marshal(p)
			if string(out) == "" {
				t.Fatal("no preview")
			}
		})
	}
}

func TestUnknownTrackProbeFailurePreservesDownloadAndExplicitAbsence(t *testing.T) {
	for _, codec := range []string{"", "none"} {
		calls := 0
		r := &MediaResolver{extract: func(context.Context, string, string) ([]byte, error) {
			return []byte(`{"ext":"mp4","vcodec":"h264","acodec":"` + codec + `","url":"https://cdn.example/clip.mp4"}`), nil
		}, probe: func(context.Context, playbackTrack) (rawMediaFormat, error) {
			calls++
			return rawMediaFormat{}, errors.New("network unavailable")
		}}
		p, err := r.Resolve(context.Background(), "https://example.com/watch")
		if err != nil || p.Kind != "video" || p.HasAudio {
			t.Fatalf("probe failure broke video: %+v %v", p, err)
		}
		if (calls == 1) != (codec == "") {
			t.Fatal("explicit absent track was probed")
		}
	}
}
