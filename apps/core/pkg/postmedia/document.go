// Package postmedia handles finite resources from a single public social post.
package postmedia

import (
	"bytes"
	"caorushizi.cn/mediago/pkg/xmedia"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os/exec"
	"path/filepath"
	"regexp"
	"time"
)

var resourcePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)
var instagramPath = regexp.MustCompile(`^/(?:p|reel|reels|tv)/([A-Za-z0-9_-]{1,64})/?$`)

func InstagramID(source string) (string, error) {
	u, e := url.Parse(source)
	if e != nil || u.User != nil || u.Port() != "" || (u.Scheme != "http" && u.Scheme != "https") || (u.Hostname() != "www.instagram.com" && u.Hostname() != "instagram.com") {
		return "", errors.New("a single Instagram post is required")
	}
	m := instagramPath.FindStringSubmatch(u.EscapedPath())
	if m == nil {
		return "", errors.New("a single Instagram post is required")
	}
	return m[1], nil
}

func ResourceID(info map[string]any) (string, error) {
	if id, _ := info["_nyacatch_resource_id"].(string); resourcePattern.MatchString(id) {
		return id, nil
	}
	id, _ := info["id"].(string)
	if !resourcePattern.MatchString(id) {
		return "", errors.New("resource has no stable identifier")
	}
	return "yt-" + id, nil
}

func Select(data []byte, selected string) ([]byte, error) {
	if !resourcePattern.MatchString(selected) {
		return nil, errors.New("invalid resource identifier")
	}
	var root map[string]any
	if json.Unmarshal(data, &root) != nil {
		return nil, errors.New("invalid post metadata")
	}
	if entries, ok := root["entries"].([]any); ok {
		if len(entries) == 0 || len(entries) > 20 {
			return nil, errors.New("post resource count is outside supported range")
		}
		var match map[string]any
		for _, entry := range entries {
			item, ok := entry.(map[string]any)
			if !ok {
				return nil, errors.New("post contains an unavailable resource")
			}
			id, e := ResourceID(item)
			if e != nil {
				return nil, e
			}
			if id == selected {
				if match != nil {
					return nil, errors.New("ambiguous resource identifier")
				}
				match = item
			}
		}
		if match == nil {
			return nil, errors.New("selected post resource is no longer present")
		}
		return json.Marshal(match)
	}
	id, e := ResourceID(root)
	if e != nil || id != selected {
		return nil, errors.New("selected post resource is no longer present")
	}
	return data, nil
}

type limitedOutput struct {
	bytes.Buffer
	overflow bool
}

func (w *limitedOutput) Write(p []byte) (int, error) {
	n := len(p)
	left := 4*1024*1024 - w.Len()
	if n > left {
		w.overflow = true
	}
	if left > 0 {
		w.Buffer.Write(p[:min(left, n)])
	}
	return n, nil
}

func Extract(ctx context.Context, binary, source, proxy string) ([]byte, error) {
	if _, e := InstagramID(source); e != nil {
		if _, xe := xmedia.StatusID(source); xe != nil {
			return nil, e
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	args := append(PluginArguments(filepath.Dir(binary), source), "--ignore-config", "--dump-single-json", "--skip-download", "--no-playlist", "--no-warnings", "--socket-timeout", "15", "--retries", "0")
	if proxy != "" {
		args = append(args, "--proxy", proxy)
	}
	args = append(args, "--", source)
	cmd := exec.CommandContext(ctx, binary, args...)
	configureCommand(cmd)
	cmd.WaitDelay = time.Second
	out, errOut := &limitedOutput{}, &limitedOutput{}
	cmd.Stdout = out
	cmd.Stderr = errOut
	if e := cmd.Run(); e != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		detail := errOut.String()
		if len(detail) > 2000 {
			detail = detail[:2000]
		}
		return nil, fmt.Errorf("post extraction failed: %s", detail)
	}
	if out.overflow {
		return nil, errors.New("post metadata exceeds size limit")
	}
	return out.Bytes(), nil
}
