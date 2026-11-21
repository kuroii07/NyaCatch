package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"caorushizi.cn/mediago/pkg/collection"
)

func (r *MediaResolver) collectionProxy() string {
	if r.Config != nil {
		if enabled, _ := r.Config.Get("useProxy").(bool); enabled {
			proxy, _ := r.Config.Get("proxy").(string)
			return proxy
		}
	}
	return ""
}
func (r *MediaResolver) DiscoverCollection(ctx context.Context, source string, page int) (*collection.Page, error) {
	if err := ValidateMediaURL(source); err != nil {
		return nil, err
	}
	if page < 1 || page > 2000 {
		return nil, errors.New("invalid collection page")
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	switch collection.Kind(source) {
	case "bilibili":
		client, close, err := collection.NewBilibiliClient(r.collectionProxy())
		if err != nil {
			return nil, err
		}
		defer close()
		return client.Discover(ctx, source, page)
	case "youtube":
		return r.youtubeCollection(ctx, source, page)
	default:
		return nil, errors.New("this collection link is not supported yet")
	}
}
func (r *MediaResolver) ResolveCollectionEntry(ctx context.Context, source string, s *collection.Selection) (*MediaPreview, error) {
	if s == nil {
		return r.Resolve(ctx, source)
	}
	resolved, err := collection.RefreshPart(ctx, source, s, r.collectionProxy())
	if err != nil {
		return nil, err
	}
	result, err := r.Resolve(ctx, resolved)
	if err != nil {
		return nil, err
	}
	if len(result.Resources) > 0 {
		return nil, errors.New("nested collections require a separate selection")
	}
	result.Collection = s
	return result, nil
}
func CollectionArguments(source, proxy string, page int) []string {
	start := (page-1)*collection.PageSize + 1
	args := []string{"--ignore-config", "--no-cache-dir", "--dump-single-json", "--skip-download", "--flat-playlist", "--yes-playlist", "--no-warnings", "--no-progress", "--socket-timeout", "15", "--retries", "0", "--playlist-start", strconv.Itoa(start), "--playlist-end", strconv.Itoa(start + collection.PageSize)}
	if proxy != "" {
		args = append(args, "--proxy", proxy)
	}
	return append(args, "--", source)
}
func (r *MediaResolver) youtubeCollection(ctx context.Context, source string, page int) (*collection.Page, error) {
	command := exec.CommandContext(ctx, r.Binary, CollectionArguments(source, r.collectionProxy(), page)...)
	configureMediaCommand(command)
	command.WaitDelay = time.Second
	stdout := &cappedOutput{limit: 4 * 1024 * 1024}
	stderr := &cappedOutput{limit: 4096}
	command.Stdout, command.Stderr = stdout, stderr
	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("collection extraction failed: %s", strings.TrimSpace(stderr.String()))
	}
	if stdout.overflow {
		return nil, errors.New("collection metadata exceeds limit")
	}
	return ParseYouTubeCollection(stdout.Bytes(), source, page)
}
func ParseYouTubeCollection(data []byte, source string, page int) (*collection.Page, error) {
	var root struct {
		Type    string `json:"_type"`
		Title   string `json:"title"`
		Count   int    `json:"playlist_count"`
		Entries []struct {
			ID           string  `json:"id"`
			Title        string  `json:"title"`
			URL          string  `json:"url"`
			Duration     float64 `json:"duration"`
			Availability string  `json:"availability"`
		} `json:"entries"`
	}
	if collection.Kind(source) != "youtube" || page < 1 || page > 2000 || len(data) > 4*1024*1024 || json.Unmarshal(data, &root) != nil || root.Type != "playlist" || len(root.Entries) > collection.PageSize+1 {
		return nil, errors.New("invalid YouTube collection metadata")
	}
	result := &collection.Page{URL: source, Title: root.Title, Source: "YouTube", Kind: "youtube-playlist", Total: root.Count, Page: page, HasMore: len(root.Entries) > collection.PageSize, Entries: []collection.Entry{}}
	seen := map[string]bool{}
	for i, e := range root.Entries {
		if i == collection.PageSize {
			break
		}
		child := e.URL
		if collection.YouTubeVideoID(child) == "" {
			child = "https://www.youtube.com/watch?v=" + url.QueryEscape(e.ID)
		}
		if collection.YouTubeVideoID(child) != e.ID {
			return nil, errors.New("invalid YouTube collection entry")
		}
		if seen[e.ID] {
			continue
		}
		seen[e.ID] = true
		id := "youtube-" + e.ID
		index := (page-1)*collection.PageSize + i + 1
		available := e.Availability != "private" && e.Availability != "needs_auth" && e.Availability != "premium_only" && e.Availability != "subscriber_only" && !strings.Contains(e.Title, "[Private video]") && !strings.Contains(e.Title, "[Deleted video]")
		result.Entries = append(result.Entries, collection.Entry{ID: id, URL: child, Title: e.Title, Duration: e.Duration, Index: index, Available: available, Selection: collection.Selection{SourceURL: source, ID: id, MediaID: e.ID, Index: index}})
	}
	return result, nil
}
