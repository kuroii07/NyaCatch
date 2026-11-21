package core

import (
	"caorushizi.cn/mediago/internal/core/schema"
	"slices"
	"testing"
)

type singleItemTestConfig struct{}

func (singleItemTestConfig) GetLocalDir() string     { return "." }
func (singleItemTestConfig) GetDeleteSegments() bool { return true }
func (singleItemTestConfig) GetUseProxy() bool       { return false }
func (singleItemTestConfig) GetProxy() string        { return "" }

func TestWorkbenchSingleItemDoesNotDownloadPlaylist(t *testing.T) {
	settings, ok := schema.DefaultSchemas().GetByType("youtube")
	if !ok {
		t.Fatal("missing yt-dlp schema")
	}
	downloader := NewDownloader(nil, nil, schema.DefaultSchemas(), singleItemTestConfig{})
	params := DownloadParams{Type: DownloadType("youtube-single"), URL: "https://www.youtube.com/watch?v=aqz-KE-bpKQ&list=example", Name: "clip.mp4"}
	if !slices.Contains(downloader.buildArgs(params, settings), "--no-playlist") {
		t.Fatal("a single-item workbench task can expand into a playlist")
	}
	params.Type = TypeYoutube
	if slices.Contains(downloader.buildArgs(params, settings), "--no-playlist") {
		t.Fatal("legacy advanced playlist behavior changed")
	}
}
