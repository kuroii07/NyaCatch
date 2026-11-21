package core

import (
	"caorushizi.cn/mediago/pkg/collection"
	"caorushizi.cn/mediago/pkg/postmedia"
	"caorushizi.cn/mediago/pkg/xmedia"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var mediaProgress = regexp.MustCompile(`\[download\]\s+([\d.]+)%`)
var mediaSpeed = regexp.MustCompile(`\bat\s+(\S+/s)`)

// MediaFilenameStem removes only a known output suffix. Dots in a title are literal.
func MediaFilenameStem(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".mp4", ".webm", ".mkv", ".mov", ".flv", ".m4v", ".avi", ".ts", ".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".flac", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp", ".tif", ".tiff":
		return strings.TrimSuffix(name, filepath.Ext(name))
	}
	return name
}

func BuildMediaArguments(p DownloadParams, binaryDir, report, proxy string) ([]string, error) {
	o := p.Options
	if o == nil {
		return nil, errors.New("media output options missing")
	}
	if err := o.ValidateSource(p.URL); err != nil {
		return nil, err
	}
	if o.SaveDir == "" {
		return nil, errors.New("download directory missing")
	}
	source, err := url.Parse(p.URL)
	if err != nil || (source.Scheme != "https" && source.Scheme != "http") || source.Hostname() == "" || source.User != nil {
		return nil, errors.New("invalid media source URL")
	}
	name := SanitizeFilename(p.Name)
	name = MediaFilenameStem(name)
	if name == "" {
		name = "media"
	}
	// yt-dlp uses %-templates, so a user filename must escape every literal percent.
	template := strings.ReplaceAll(name, "%", "%%") + ".%(ext)s"
	args := []string{"--ignore-config", "--no-playlist", "--no-overwrites", "--no-mtime", "--newline", "--no-colors", "--progress", "--ffmpeg-location", binaryDir, "--paths", o.SaveDir, "--output", template, "--socket-timeout", "15", "--retries", "2", "--print-to-file"}
	stage := "after_move:%(filepath)j"
	if o.Mode == "cover" {
		stage = "after_video:%(thumbnails)j"
	}
	args = append(args, stage, report)
	switch o.Mode {
	case "video":
		selector := o.FormatID
		if selector == "" {
			selector = "bestvideo+bestaudio/best"
		} else if o.AudioFormatID != "" {
			selector += "+" + o.AudioFormatID
		}
		args = append(args, "--format", selector)
		if o.Container != "" {
			args = append(args, "--merge-output-format", o.Container)
		}
	case "audio":
		selector := o.AudioFormatID
		if selector == "" {
			selector = "bestaudio/best"
		}
		format := "best"
		if o.AudioFormat == "mp3" {
			format = "mp3"
		}
		args = append(args, "--format", selector, "--extract-audio", "--audio-format", format)
		if format == "mp3" {
			bitrate := o.AudioBitrate
			if bitrate == 0 {
				bitrate = 192
			}
			args = append(args, "--audio-quality", strconv.Itoa(bitrate)+"K")
		}
	case "cover":
		args = append(args, "--skip-download", "--write-thumbnail")
	}
	if proxy != "" {
		args = append(args, "--proxy", proxy)
	}
	return append(args, "--", p.URL), nil
}

func ValidateMediaOutput(directory, candidate string) (string, error) {
	if !filepath.IsAbs(candidate) {
		return "", errors.New("extractor did not report an absolute output path")
	}
	root, err := filepath.EvalSymlinks(directory)
	if err != nil {
		return "", err
	}
	actual, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		return "", fmt.Errorf("download output missing: %w", err)
	}
	rel, err := filepath.Rel(root, actual)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", errors.New("output path is outside the task directory")
	}
	info, err := os.Stat(actual)
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return "", errors.New("download output is not a nonempty regular file")
	}
	return actual, nil
}

func (d *DownloaderSvc) downloadMedia(ctx context.Context, p DownloadParams, cb Callbacks) error {
	if p.Type != TypeYoutubeSingle {
		return errors.New("structured media options require a single-resource task")
	}
	if err := p.Options.ValidateSource(p.URL); err != nil {
		return err
	}
	bin := d.binMap[TypeYoutube]
	if bin == "" {
		return errors.New("yt-dlp binary not configured")
	}
	if err := os.MkdirAll(p.Options.SaveDir, 0755); err != nil {
		return err
	}
	report, err := os.CreateTemp(p.Options.SaveDir, ".mediago-output-*.json")
	if err != nil {
		return err
	}
	reportPath := report.Name()
	report.Close()
	defer os.Remove(reportPath)
	proxy := ""
	if cfg, ok := d.cfg.(interface {
		GetUseProxy() bool
		GetProxy() string
	}); ok && cfg.GetUseProxy() {
		proxy = cfg.GetProxy()
	}
	if p.Options.Collection != nil {
		refreshed, refreshErr := collection.RefreshPart(ctx, p.URL, p.Options.Collection, proxy)
		if refreshErr != nil {
			return refreshErr
		}
		p.URL = refreshed
	}
	args, err := BuildMediaArguments(p, filepath.Dir(bin), reportPath, proxy)
	if err != nil {
		return err
	}
	if p.Options.Resolver == xmedia.Resolver || p.Options.Resolver == postmedia.InstagramResolver || p.Options.Resolver == postmedia.XhsResolver || p.Options.Resolver == postmedia.DouyinResolver || p.Options.ResourceID != "" {
		fetch := d.publicMetadata
		if fetch == nil {
			fetch = xmedia.Fetch
		}
		var data []byte
		if p.Options.Resolver == postmedia.DouyinResolver {
			data, err = postmedia.ExtractDouyin(ctx, p.URL, proxy)
			if err == nil {
				data, err = postmedia.Select(data, p.Options.ResourceID)
			}
		} else if p.Options.Resolver == postmedia.XhsResolver {
			data, err = postmedia.ExtractXhs(ctx, p.URL, proxy)
			if err == nil {
				data, err = postmedia.Select(data, p.Options.ResourceID)
			}
		} else if p.Options.Resolver == postmedia.InstagramResolver {
			data, err = postmedia.Extract(ctx, bin, p.URL, proxy)
			if err == nil {
				data, err = postmedia.Select(data, p.Options.ResourceID)
			}
		} else if p.Options.Resolver == xmedia.Resolver && p.Options.ResourceID != "" {
			data, err = xmedia.FetchResource(ctx, p.URL, filepath.Dir(bin), proxy, p.Options.ResourceID)
		} else if p.Options.ResourceID != "" {
			data, err = postmedia.Extract(ctx, bin, p.URL, proxy)
			if err == nil {
				data, err = postmedia.Select(data, p.Options.ResourceID)
			}
		} else {
			data, err = fetch(ctx, p.URL, filepath.Dir(bin), proxy)
		}
		if err != nil {
			return fmt.Errorf("post download refresh failed: %w", err)
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if p.Options.Mode == "image" {
			output, err := postmedia.SaveImage(ctx, data, p.Options.SaveDir, MediaFilenameStem(SanitizeFilename(p.Name)), proxy, func(n int64) {
				if cb.OnMessage != nil {
					label := "Original image"
					if p.Options.Resolver == postmedia.XhsResolver || p.Options.Resolver == postmedia.DouyinResolver {
						label = "Platform image"
					}
					cb.OnMessage(MessageEvent{ID: p.ID, Message: fmt.Sprintf("%s: %d bytes", label, n)})
				}
			})
			if err != nil {
				return err
			}
			actual, err := ValidateMediaOutput(p.Options.SaveDir, output)
			if err != nil {
				return err
			}
			if cb.OnOutput != nil {
				cb.OnOutput(actual)
			}
			return nil
		}
		info, err := os.CreateTemp(p.Options.SaveDir, ".nyacatch-x-*.info.json")
		if err != nil {
			return err
		}
		defer os.Remove(info.Name())
		_, writeErr := info.Write(data)
		closeErr := info.Close()
		if writeErr != nil {
			return writeErr
		}
		if closeErr != nil {
			return closeErr
		}
		// Only the input changes. Format selection, progress, conversion and
		// verified-output reporting keep using the existing yt-dlp flow.
		args = append(args[:len(args)-2], "--load-info-json", info.Name())
	}
	err = d.runner.Run(ctx, bin, args, func(line string) {
		if cb.OnMessage != nil {
			cb.OnMessage(MessageEvent{ID: p.ID, Message: line})
		}
		if m := mediaProgress.FindStringSubmatch(line); len(m) > 1 {
			if n, e := strconv.ParseFloat(m[1], 64); e == nil && cb.OnProgress != nil {
				speed := ""
				if s := mediaSpeed.FindStringSubmatch(line); len(s) > 1 {
					speed = s[1]
				}
				cb.OnProgress(ProgressEvent{ID: p.ID, Type: "progress", Percent: n, Speed: speed})
			}
		}
	})
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if err != nil {
		return err
	}
	data, err := os.ReadFile(reportPath)
	if err != nil {
		return err
	}
	var candidate string
	if p.Options.Mode == "cover" {
		var thumbs []struct {
			Filepath string `json:"filepath"`
		}
		if err = json.Unmarshal([]byte(strings.TrimSpace(string(data))), &thumbs); err != nil {
			return fmt.Errorf("thumbnail output report missing: %w", err)
		}
		for _, thumb := range thumbs {
			if thumb.Filepath != "" {
				candidate = thumb.Filepath
			}
		}
	} else if err = json.Unmarshal([]byte(strings.TrimSpace(string(data))), &candidate); err != nil {
		return fmt.Errorf("media output report missing: %w", err)
	}
	actual, err := ValidateMediaOutput(p.Options.SaveDir, candidate)
	if err != nil {
		return err
	}
	if cb.OnOutput != nil {
		cb.OnOutput(actual)
	}
	return nil
}
