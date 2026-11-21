package postmedia

import (
	"strings"
	"testing"
)

func TestSelectPreservesPostMediaIdentityAndRejectsAmbiguity(t *testing.T) {
	doc := []byte(`{"entries":[{"id":"1","url":"https://cdn.example/a"},{"id":"2","url":"https://cdn.example/b"}]}`)
	b, e := Select(doc, "yt-2")
	if e != nil || !strings.Contains(string(b), "/b") {
		t.Fatalf("wrong item: %s %v", b, e)
	}
	for _, d := range []string{`{"entries":[]}`, `{"entries":[{"id":"1"},{"id":"1"}]}`, `{"entries":[null]}`} {
		if _, e := Select([]byte(d), "yt-1"); e == nil {
			t.Fatal("invalid collection accepted")
		}
	}
	for _, s := range []string{"https://instagram.com/user/", "https://instagram.com.evil/p/BQ0eAlwhDrw/", "https://user@instagram.com/p/BQ0eAlwhDrw/"} {
		if _, e := InstagramID(s); e == nil {
			t.Fatal("invalid post accepted")
		}
	}
}
