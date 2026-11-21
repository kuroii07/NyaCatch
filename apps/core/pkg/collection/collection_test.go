package collection

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func fixtureClient(body string) *BilibiliClient {
	return &BilibiliClient{HTTP: &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "api.bilibili.com" {
			return nil, fmt.Errorf("unexpected host")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}, nil
	})}}
}
func TestPartsKeepParametersAndRefreshByCID(t *testing.T) {
	client := fixtureClient(`{"code":0,"data":{"title":"parts","pages":[{"page":1,"cid":22,"part":"second"},{"page":2,"cid":11,"part":"first"}]}}`)
	source := "https://www.bilibili.com/video/BV17u411o7Xk/?share=a%2Bb#section"
	page, err := client.Discover(context.Background(), source, 1)
	if err != nil || page.Total != 2 || len(page.Entries) != 2 {
		t.Fatalf("%+v %v", page, err)
	}
	selected := page.Entries[1].Selection
	selected.Index = 1
	resolved, err := client.RefreshPart(context.Background(), source+"", &selected)
	if err != nil || !strings.Contains(resolved, "p=2") || !strings.Contains(resolved, "share=a%2Bb") || !strings.HasSuffix(resolved, "#section") {
		t.Fatalf("identity or parameters lost: %s %v", resolved, err)
	}
	selected.CID = "99"
	selected.ID = "bili-BV17u411o7Xk-99"
	if _, err = client.RefreshPart(context.Background(), source, &selected); err == nil {
		t.Fatal("missing CID fell back to first part")
	}
}
func TestCollectionBoundsAndIdentity(t *testing.T) {
	source := "https://www.bilibili.com/video/BV17u411o7Xk/"
	valid := Selection{SourceURL: source, ID: "bili-BV17u411o7Xk-22", CID: "22", Index: 2}
	if Validate(source, &valid) != nil {
		t.Fatal("valid identity rejected")
	}
	for _, bad := range []string{"https://www.bilibili.com.evil/video/BV17u411o7Xk/", "https://user:pass@www.bilibili.com/video/BV17u411o7Xk/", "file:///video/BV17u411o7Xk/", "https://youtube.com/watch?v=abcdefghijk"} {
		if Validate(bad, &valid) == nil {
			t.Fatalf("wrong video accepted: %s", bad)
		}
	}
	client := fixtureClient(`{"code":-412,"message":"limited"}`)
	if _, err := client.Discover(context.Background(), source, 0); err == nil {
		t.Fatal("unbounded page accepted")
	}
	if _, err := client.Discover(context.Background(), source, 1); err == nil {
		t.Fatal("site refusal hidden")
	}
	client = fixtureClient(`{"code":0,"data":{"title":"single","pages":[{"page":1,"cid":1}]}}`)
	if result, err := client.Discover(context.Background(), source, 1); err != nil || result != nil {
		t.Fatal("single video became collection")
	}
}
func TestPartsPaginationHasNoSilentTruncation(t *testing.T) {
	var parts []string
	for i := 1; i <= 55; i++ {
		parts = append(parts, fmt.Sprintf(`{"page":%d,"cid":%d,"part":"part"}`, i, i))
	}
	client := fixtureClient(`{"code":0,"data":{"pages":[` + strings.Join(parts, ",") + `]}}`)
	first, err := client.Discover(context.Background(), "https://www.bilibili.com/video/BV17u411o7Xk/", 1)
	if err != nil || len(first.Entries) != 50 || !first.HasMore || first.Total != 55 {
		t.Fatal("first page lost total")
	}
	second, err := client.Discover(context.Background(), first.URL, 2)
	if err != nil || len(second.Entries) != 5 || second.HasMore || second.Entries[0].Index != 51 {
		t.Fatal("second page changed order")
	}
}
