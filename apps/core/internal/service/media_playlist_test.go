package service

import (
	"slices"
	"testing"
)

func TestYouTubeCollectionUsesIndependentVideos(t *testing.T) {
	source := "https://www.youtube.com/playlist?list=PLexample"
	doc := []byte(`{"_type":"playlist","title":"playlist","playlist_count":2,"entries":[{"id":"abcdefghijk","url":"abcdefghijk","title":"one"},{"id":"12345678901","url":"https://www.youtube.com/watch?v=12345678901","title":"[Private video]","availability":"private"}]}`)
	result, err := ParseYouTubeCollection(doc, source, 1)
	if err != nil || len(result.Entries) != 2 || result.Entries[0].URL == source || result.Entries[1].Available {
		t.Fatalf("%+v %v", result, err)
	}
	args := CollectionArguments(source, "socks5://127.0.0.1:9999", 2)
	if args[slices.Index(args, "--playlist-start")+1] != "51" || args[slices.Index(args, "--playlist-end")+1] != "101" || !slices.Contains(args, "--skip-download") || !slices.Contains(args, "--flat-playlist") {
		t.Fatal("enumeration unbounded or downloads media")
	}
	if _, err := ParseYouTubeCollection([]byte(`{"_type":"playlist","entries":[{"id":"abcdefghijk","url":"https://evil.example/a"}]}`), source, 1); err != nil {
		t.Fatal("safe canonical video URL should replace non-video extractor reference")
	}
	if _, err := ParseYouTubeCollection([]byte(`{"_type":"playlist","entries":[{"id":"../bad"}]}`), source, 1); err == nil {
		t.Fatal("invalid video ID accepted")
	}
}
