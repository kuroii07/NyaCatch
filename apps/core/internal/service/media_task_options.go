package service

import (
	"caorushizi.cn/mediago/internal/core"
	"caorushizi.cn/mediago/pkg/postmedia"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var ErrInvalidTaskInput = errors.New("invalid download task")

func mediaTaskOptions(input *AddDownloadTaskInput) (*core.MediaOptions, error) {
	if input.Thumbnail != nil && *input.Thumbnail != "" {
		if len(*input.Thumbnail) > 8192 || ValidateMediaURL(*input.Thumbnail) != nil {
			return nil, fmt.Errorf("%w: invalid thumbnail URL", ErrInvalidTaskInput)
		}
	}
	if input.Options == nil {
		return nil, nil
	}
	o := *input.Options
	if input.Type != "youtube-single" || o.SaveDir == "" {
		return nil, fmt.Errorf("%w: media options require a single-resource task and directory", ErrInvalidTaskInput)
	}
	if err := ValidateMediaURL(input.URL); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidTaskInput, err)
	}
	if input.Folder != nil && *input.Folder != "" {
		return nil, fmt.Errorf("%w: structured task uses its saved directory", ErrInvalidTaskInput)
	}
	if err := o.ValidateSource(input.URL); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidTaskInput, err)
	}
	if o.Resolver == postmedia.XhsResolver || o.Resolver == postmedia.DouyinResolver {
		input.Thumbnail = nil
	}
	return &o, nil
}

func (s *DownloadTaskService) allocateMediaName(title string, o *core.MediaOptions, used map[string]bool) (string, error) {
	candidate := title
	for attempt := 0; attempt < 20; attempt++ {
		existing, err := s.repo.FindByName(candidate)
		if err != nil {
			return "", err
		}
		taken := existing != nil || used[strings.ToLower(candidate)]
		if o != nil {
			stem := core.MediaFilenameStem(candidate)
			taken = taken || used["media-stem:"+strings.ToLower(stem)]
			reserved, err := s.repo.HasFilenameStem(stem)
			if err != nil {
				return "", err
			}
			taken = taken || reserved
			entries, err := os.ReadDir(o.SaveDir)
			if err != nil && !os.IsNotExist(err) {
				return "", err
			}
			for _, entry := range entries {
				// Reserve completed outputs and yt-dlp companions (.part, .ytdl,
				// .f<id>.<ext>, fragments). A new URL must never resume old bytes.
				if strings.EqualFold(core.MediaFilenameStem(entry.Name()), stem) || strings.HasPrefix(strings.ToLower(entry.Name()), strings.ToLower(stem)+".") {
					taken = true
				}
			}
		}
		if !taken {
			used[strings.ToLower(candidate)] = true
			if o != nil {
				used["media-stem:"+strings.ToLower(core.MediaFilenameStem(candidate))] = true
			}
			return candidate, nil
		}
		candidate = uniqueMediaName(title)
	}
	return "", errors.New("could not allocate a unique media filename")
}

func (s *DownloadTaskService) RecordOutput(id int64, path string) error {
	video, err := s.repo.FindByIDOrFail(id)
	if err != nil {
		return err
	}
	if video.Options == nil {
		return s.repo.UpdateStatus([]int64{id}, "success")
	}
	actual, err := core.ValidateMediaOutput(video.Options.SaveDir, path)
	if err != nil {
		return err
	}
	_, err = s.repo.Update(id, map[string]interface{}{"outputPath": actual, "name": filepath.Base(actual), "status": "success"})
	return err
}

func (s *DownloadTaskService) RecoverInterruptedTasks() error {
	tasks, err := s.repo.FindByStatus([]string{"pending", "downloading"})
	if err != nil {
		return err
	}
	ids := make([]int64, 0, len(tasks))
	for _, task := range tasks {
		ids = append(ids, task.ID)
	}
	if len(ids) > 0 {
		return s.repo.UpdateStatus(ids, "stopped")
	}
	return nil
}
