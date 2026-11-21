package service

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"caorushizi.cn/mediago/internal/core"
	"caorushizi.cn/mediago/internal/db"
	"caorushizi.cn/mediago/pkg/postmedia"
)

const maxThumbnailBytes = 5 * 1024 * 1024

type TaskThumbnailService struct {
	tasks               *DownloadTaskService
	binaryDir, cacheDir string
	config              interface{ Get(string) any }
	resolve             func(context.Context, string) (*MediaPreview, error)
	slots               chan struct{}
	failures            sync.Map
}

func NewTaskThumbnailService(tasks *DownloadTaskService, binaryDir, cacheDir string, config interface{ Get(string) any }) *TaskThumbnailService {
	resolver := NewMediaResolver(binaryDir)
	resolver.Config = config
	return &TaskThumbnailService{tasks: tasks, binaryDir: binaryDir, cacheDir: cacheDir, config: config, resolve: resolver.Resolve, slots: make(chan struct{}, 2)}
}

func thumbnailType(data []byte) (string, error) {
	switch mime := http.DetectContentType(data); mime {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
		return mime, nil
	default:
		return "", errors.New("thumbnail is not a supported raster image")
	}
}

func readThumbnail(file string) ([]byte, string, error) {
	input, err := os.Open(file)
	if err != nil {
		return nil, "", err
	}
	defer input.Close()
	data, err := io.ReadAll(io.LimitReader(input, maxThumbnailBytes+1))
	if err != nil || len(data) > maxThumbnailBytes {
		return nil, "", errors.New("thumbnail exceeds size limit")
	}
	mime, err := thumbnailType(data)
	return data, mime, err
}

func (s *TaskThumbnailService) Get(parent context.Context, id int64) ([]byte, string, error) {
	task, err := s.tasks.FindByIDOrFail(id)
	if err != nil {
		return nil, "", err
	}
	// Include the source identity so editing an old task cannot reuse another cover.
	cache := filepath.Join(s.cacheDir, fmt.Sprintf("%d-%x.image", id, sha256.Sum256([]byte(task.URL))))
	negativeKey := cache + ":" + task.Status
	if data, mime, err := readThumbnail(cache); err == nil {
		return data, mime, nil
	}
	if until, ok := s.failures.Load(negativeKey); ok && time.Now().Before(until.(time.Time)) {
		return nil, "", errors.New("thumbnail unavailable")
	}
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	case <-parent.Done():
		return nil, "", parent.Err()
	}
	ctx, cancel := context.WithTimeout(parent, 18*time.Second)
	defer cancel()
	if data, mime, err := readThumbnail(cache); err == nil {
		return data, mime, nil
	}
	if err = os.MkdirAll(s.cacheDir, 0755); err != nil {
		return nil, "", err
	}
	var image []byte
	saved := ""
	if task.Thumbnail != nil {
		saved = *task.Thumbnail
	}
	if saved != "" {
		image, err = s.fetch(ctx, saved)
	}
	if len(image) == 0 && (task.Options == nil || (task.Options.Resolver != postmedia.XhsResolver && task.Options.Resolver != postmedia.DouyinResolver)) {
		metadataCtx, stop := context.WithTimeout(ctx, 8*time.Second)
		preview, previewErr := s.resolve(metadataCtx, task.URL)
		stop()
		if previewErr == nil && preview != nil && preview.Thumbnail != "" && preview.Thumbnail != saved {
			image, err = s.fetch(ctx, preview.Thumbnail)
			if err == nil {
				_ = s.tasks.SaveThumbnail(id, task.URL, preview.Thumbnail)
			}
		}
	}
	if len(image) == 0 {
		image, err = s.localFrame(ctx, task)
	}
	if err != nil || len(image) == 0 {
		if ctx.Err() == nil {
			s.failures.Store(negativeKey, time.Now().Add(10*time.Minute))
		}
		return nil, "", errors.New("thumbnail unavailable")
	}
	mime, err := thumbnailType(image)
	if err != nil {
		return nil, "", err
	}
	temp, err := os.CreateTemp(s.cacheDir, ".thumbnail-*")
	if err != nil {
		return nil, "", err
	}
	defer os.Remove(temp.Name())
	_, err = temp.Write(image)
	closeErr := temp.Close()
	if err != nil {
		return nil, "", err
	}
	if closeErr != nil {
		return nil, "", closeErr
	}
	if err = os.Rename(temp.Name(), cache); err != nil {
		if data, mime, e := readThumbnail(cache); e == nil {
			return data, mime, nil
		}
		return nil, "", err
	}
	s.failures.Delete(negativeKey)
	return image, mime, nil
}

func (s *TaskThumbnailService) fetch(ctx context.Context, source string) ([]byte, error) {
	if len(source) > 8192 || ValidateMediaURL(source) != nil {
		return nil, errors.New("invalid thumbnail URL")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if s.config != nil {
		if enabled, _ := s.config.Get("useProxy").(bool); enabled {
			if raw, ok := s.config.Get("proxy").(string); ok && raw != "" {
				proxy, err := url.Parse(raw)
				if err != nil {
					return nil, err
				}
				transport.Proxy = http.ProxyURL(proxy)
			}
		}
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 5 * time.Second}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", "Mozilla/5.0")
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("thumbnail source returned %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxThumbnailBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxThumbnailBytes {
		return nil, errors.New("thumbnail exceeds size limit")
	}
	if _, err = thumbnailType(data); err != nil {
		return nil, err
	}
	return data, nil
}

func (s *TaskThumbnailService) localFrame(ctx context.Context, task *db.Video) ([]byte, error) {
	directory := ""
	file := ""
	if task.Options != nil && task.OutputPath != nil {
		directory = task.Options.SaveDir
		file = *task.OutputPath
	} else if task.Status == "success" && s.config != nil {
		directory, _ = s.config.Get("local").(string)
		if task.Folder != nil {
			directory = filepath.Join(directory, *task.Folder)
		}
		_, file = CheckFileExists(task.Name, directory)
	}
	if directory == "" || file == "" {
		return nil, errors.New("no local media")
	}
	actual, err := core.ValidateMediaOutput(directory, file)
	if err != nil {
		return nil, err
	}
	if image, _, err := readThumbnail(actual); err == nil {
		return image, nil
	}
	binary := "ffmpeg"
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	temp, err := os.CreateTemp(s.cacheDir, ".frame-*.jpg")
	if err != nil {
		return nil, err
	}
	name := temp.Name()
	temp.Close()
	defer os.Remove(name)
	frameCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	command := exec.CommandContext(frameCtx, filepath.Join(s.binaryDir, binary), "-hide_banner", "-loglevel", "error", "-y", "-ss", "0", "-i", actual, "-frames:v", "1", "-an", "-sn", "-vf", "scale=320:180:force_original_aspect_ratio=decrease", "-q:v", "3", name)
	configureMediaCommand(command)
	command.WaitDelay = time.Second
	command.Stderr = &cappedOutput{limit: 4096}
	if err = command.Run(); err != nil {
		return nil, err
	}
	image, _, err := readThumbnail(name)
	return image, err
}
