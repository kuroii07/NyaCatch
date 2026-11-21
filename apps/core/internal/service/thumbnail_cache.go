package service

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
)

var thumbnailCacheName = regexp.MustCompile(`^[1-9][0-9]*-[a-f0-9]{64}\.image$`)

type ThumbnailCacheInfo struct {
	Files int   `json:"files"`
	Bytes int64 `json:"bytes"`
	Busy  int   `json:"busy"`
}

// Refuse cache-root links before reading or deleting managed entries.
func (s *TaskThumbnailService) safeCacheRoot() error {
	if !filepath.IsAbs(s.cacheDir) {
		return errors.New("invalid thumbnail cache root")
	}
	info, err := os.Lstat(s.cacheDir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	resolved, err := filepath.EvalSymlinks(s.cacheDir)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || filepath.Clean(resolved) != filepath.Clean(s.cacheDir) {
		return errors.New("thumbnail cache root is not a regular directory")
	}
	return nil
}

func (s *TaskThumbnailService) cacheInfoLocked() (ThumbnailCacheInfo, error) {
	result := ThumbnailCacheInfo{Busy: len(s.active)}
	if err := s.safeCacheRoot(); err != nil {
		return result, err
	}
	entries, err := os.ReadDir(s.cacheDir)
	if os.IsNotExist(err) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	for _, entry := range entries {
		if !thumbnailCacheName.MatchString(entry.Name()) || entry.Type()&os.ModeSymlink != 0 {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return result, err
		}
		if info.Mode().IsRegular() {
			result.Files++
			result.Bytes += info.Size()
		}
	}
	return result, nil
}
func (s *TaskThumbnailService) CacheInfo() (ThumbnailCacheInfo, error) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	return s.cacheInfoLocked()
}
func (s *TaskThumbnailService) ClearCache() (ThumbnailCacheInfo, error) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if err := s.safeCacheRoot(); err != nil {
		return ThumbnailCacheInfo{}, err
	}
	entries, err := os.ReadDir(s.cacheDir)
	if err != nil && !os.IsNotExist(err) {
		return ThumbnailCacheInfo{}, err
	}
	for _, entry := range entries {
		name := filepath.Join(s.cacheDir, entry.Name())
		if !thumbnailCacheName.MatchString(entry.Name()) || s.active[name] > 0 || entry.Type()&os.ModeSymlink != 0 {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return ThumbnailCacheInfo{}, err
		}
		if info.Mode().IsRegular() {
			if err := os.Remove(name); err != nil && !os.IsNotExist(err) {
				return ThumbnailCacheInfo{}, err
			}
		}
	}
	s.failures.Clear()
	return s.cacheInfoLocked()
}
