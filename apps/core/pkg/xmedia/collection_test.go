package xmedia

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestCollectionKeepsOrderedOriginalPhotosAndExactResource(t *testing.T) {
	body := `{"status":{"id":"2113612120076251186","text":"post","media":{"all":[{"id":"100","type":"photo","url":"https://pbs.twimg.com/media/one.png?name=small"},{"id":"101","type":"video","url":"https://video.twimg.com/a.mp4","thumbnail_url":"https://pbs.twimg.com/thumb.jpg"},{"id":"102","type":"photo","url":"https://pbs.twimg.com/media/two.jpg"}]}}}`
	c := fixtureClient(body, true)
	data, e := c.Collection(context.Background(), sourceURL, "")
	if e != nil {
		t.Fatal(e)
	}
	var root struct {
		Entries []map[string]any `json:"entries"`
	}
	json.Unmarshal(data, &root)
	if len(root.Entries) != 3 || root.Entries[0]["_nyacatch_resource_id"] != "x-image-100" || root.Entries[1]["_nyacatch_resource_id"] != "x-video-101" || !strings.Contains(root.Entries[0]["url"].(string), "name=orig") {
		t.Fatalf("order or original image lost: %s", data)
	}
	selected, e := c.Collection(context.Background(), sourceURL, "x-image-102")
	if e != nil || !strings.Contains(string(selected), "two.jpg") || strings.Contains(string(selected), "a.mp4") {
		t.Fatal("selection changed identity", e)
	}
	if _, e = c.Collection(context.Background(), sourceURL, "x-image-removed"); e == nil {
		t.Fatal("missing selection replaced")
	}
	if _, e = fixtureClient(strings.Replace(body, "https://pbs.twimg.com/media/two.jpg", "http://127.0.0.1/secret.jpg", 1), true).Collection(context.Background(), sourceURL, ""); e == nil {
		t.Fatal("untrusted photo accepted")
	}
}
