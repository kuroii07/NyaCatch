package xmedia

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"path"
	"regexp"
	"strings"
)

var resourceID = regexp.MustCompile(`^[a-zA-Z0-9._-]{1,128}$`)

func (c *Client) Collection(ctx context.Context, source, selected string) ([]byte, error) {
	id, err := StatusID(source)
	if err != nil {
		return nil, err
	}
	if selected != "" && !resourceID.MatchString(selected) {
		return nil, errors.New("invalid resource identifier")
	}
	data, err := c.statusBytes(ctx, id)
	if err != nil {
		return nil, err
	}
	var response struct {
		Status *publicStatus `json:"status"`
		Tweet  *publicStatus `json:"tweet"`
	}
	if json.Unmarshal(data, &response) != nil {
		return nil, errors.New("invalid public X response")
	}
	status := response.Status
	if status == nil {
		status = response.Tweet
	}
	if status == nil || status.ID != id {
		return nil, errors.New("public X response does not match the requested status")
	}
	media := status.Media.All
	if len(media) == 0 {
		if len(status.Media.Photos) > 0 && len(status.Media.Videos) > 0 {
			return nil, errors.New("public X response omitted mixed-media ordering")
		}
		media = append(media, status.Media.Photos...)
		media = append(media, status.Media.Videos...)
	}
	if len(media) == 0 || len(media) > 20 {
		return nil, errors.New("public X response contains no supported resources or exceeds 20 items")
	}
	if c.InventoryOnly && len(media) == 1 && media[0].Type == "video" {
		return nil, errors.New("post contains one video")
	}
	entries := []map[string]any{}
	seen := map[string]bool{}
	for _, m := range media {
		kind := "video"
		if m.Type == "photo" {
			kind = "image"
		}
		key := m.ID
		if key == "" {
			u, e := url.Parse(m.URL)
			if e != nil {
				return nil, errors.New("invalid X resource URL")
			}
			hash := sha256.Sum256([]byte(u.Hostname() + u.Path))
			key = hex.EncodeToString(hash[:12])
		}
		key = "x-" + kind + "-" + key
		if !resourceID.MatchString(key) || seen[key] {
			return nil, errors.New("invalid or duplicate X resource identity")
		}
		seen[key] = true
		if selected != "" && key != selected {
			continue
		}
		var info map[string]any
		if kind == "image" {
			if !mediaURL(m.URL, "pbs.twimg.com", false) {
				return nil, errors.New("public X response contains unsupported photo")
			}
			u, _ := url.Parse(m.URL)
			ext := strings.TrimPrefix(strings.ToLower(path.Ext(u.Path)), ".")
			if strings.HasPrefix(u.Path, "/media/") {
				q := u.Query()
				q.Set("name", "orig")
				u.RawQuery = q.Encode()
			}
			info = map[string]any{"id": key, "title": status.Text, "ext": ext, "url": u.String(), "thumbnail": m.URL, "_nyacatch_kind": "image", "_nyacatch_resolver": Resolver, "extractor_key": "Twitter", "uploader": status.Author.Name, "webpage_url": source, "original_url": source}
		} else {
			var e error
			info, e = c.videoInfo(ctx, source, status, m)
			if e != nil {
				return nil, e
			}
		}
		info["_nyacatch_resource_id"] = key
		entries = append(entries, info)
	}
	if selected != "" {
		if len(entries) != 1 {
			return nil, errors.New("selected X resource is no longer present")
		}
		return json.Marshal(entries[0])
	}
	// Keep the existing single-video metadata shape and quality identifiers.
	if len(entries) == 1 && entries[0]["_nyacatch_kind"] != "image" {
		delete(entries[0], "_nyacatch_resource_id")
		return json.Marshal(entries[0])
	}
	return json.Marshal(map[string]any{"_type": "playlist", "id": id, "title": status.Text, "extractor_key": "Twitter", "entries": entries, "_nyacatch_collection": true, "webpage_url": source})
}
