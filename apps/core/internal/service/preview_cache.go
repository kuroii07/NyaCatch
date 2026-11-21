package service

import (
	"caorushizi.cn/mediago/internal/logger"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const previewFileLimit int64 = 1 << 30
const previewCacheLimit int64 = 2 << 30

var previewCacheName = regexp.MustCompile(`^([a-f0-9]{64})\.(mp4|m4a|json)$`)

type PreviewState struct {
	ID       string `json:"id"`
	Status   string `json:"status"`
	Progress int    `json:"progress"`
	Cached   bool   `json:"cached"`
	Path     string `json:"path,omitempty"`
	Error    string `json:"error,omitempty"`
}
type PreviewCacheInfo struct {
	Files int   `json:"files"`
	Bytes int64 `json:"bytes"`
	Busy  int   `json:"busy"`
}
type previewWork struct {
	key, source, extension string
	size, modified         int64
	state                  PreviewState
	cancel                 context.CancelFunc
}
type previewMeta struct {
	Version  int   `json:"version"`
	Bytes    int64 `json:"bytes"`
	Modified int64 `json:"modified"`
}

// Preview requests are temporary leases, not conversion records. Releasing the
// final lease cancels generation while completed files remain available for reuse.
type PreviewCache struct {
	mu           sync.Mutex
	root         string
	converter    *Converter
	leases       map[string]*previewWork
	works        map[string]*previewWork
	initialized  sync.Once
	initialError error
}

func NewPreviewCache(root string, converter *Converter) *PreviewCache {
	return &PreviewCache{root: root, converter: converter, leases: map[string]*previewWork{}, works: map[string]*previewWork{}}
}
func (p *PreviewCache) ensureRoot() error {
	if p.root == "" || !filepath.IsAbs(p.root) {
		return fmt.Errorf("pcCacheError")
	}
	if err := os.MkdirAll(p.root, 0700); err != nil {
		return fmt.Errorf("pcCacheError")
	}
	actual, err := filepath.EvalSymlinks(p.root)
	if err != nil || !strings.EqualFold(filepath.Clean(actual), filepath.Clean(p.root)) {
		return fmt.Errorf("pcCacheError")
	}
	p.initialized.Do(func() {
		entries, e := os.ReadDir(p.root)
		if e != nil {
			p.initialError = fmt.Errorf("pcCacheError")
			return
		}
		for _, entry := range entries {
			if !strings.HasPrefix(entry.Name(), ".preview-") {
				continue
			}
			dir := filepath.Join(p.root, entry.Name())
			info, e := os.Lstat(dir)
			if e != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
				continue
			}
			marker := filepath.Join(dir, ".nyacatch-preview.json")
			info, e = os.Lstat(marker)
			if e != nil || !info.Mode().IsRegular() || info.Size() > 1024 {
				continue
			}
			raw, e := os.ReadFile(marker)
			var receipt struct {
				Version int
				Key     string
			}
			if e != nil || json.Unmarshal(raw, &receipt) != nil || receipt.Version != 1 || !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(receipt.Key) {
				continue
			}
			if e = os.RemoveAll(dir); e != nil {
				p.initialError = fmt.Errorf("pcCacheError")
				return
			}
		}
	})
	return p.initialError
}
func previewSource(input string) (string, os.FileInfo, error) {
	if !filepath.IsAbs(input) || len(input) > 32768 || strings.ContainsRune(input, 0) {
		return "", nil, fmt.Errorf("pcUnavailable")
	}
	file, err := filepath.EvalSymlinks(input)
	if err != nil {
		return "", nil, fmt.Errorf("pcUnavailable")
	}
	info, err := os.Stat(file)
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return "", nil, fmt.Errorf("pcUnavailable")
	}
	return file, info, nil
}
func (p *PreviewCache) state(id string, w *previewWork) PreviewState {
	v := w.state
	v.ID = id
	return v
}
func (p *PreviewCache) Start(input string, requestIDs ...string) (PreviewState, error) {
	file, info, err := previewSource(input)
	if err != nil {
		return PreviewState{}, err
	}
	if err = p.ensureRoot(); err != nil {
		return PreviewState{}, err
	}
	// Recipe version is part of the key; size and nanosecond mtime invalidate a
	// preview when the source changes, without hashing multi-gigabyte media first.
	identity := file
	if runtime.GOOS == "windows" {
		identity = strings.ToLower(identity)
	}
	sum := sha256.Sum256([]byte(fmt.Sprintf("preview-v1\x00%s\x00%d\x00%d", identity, info.Size(), info.ModTime().UnixNano())))
	key := hex.EncodeToString(sum[:])
	var token [32]byte
	if _, err = rand.Read(token[:]); err != nil {
		return PreviewState{}, err
	}
	id := hex.EncodeToString(token[:])
	if len(requestIDs) > 0 && requestIDs[0] != "" {
		id = requestIDs[0]
		if !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(id) {
			return PreviewState{}, fmt.Errorf("pcUnavailable")
		}
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if old := p.leases[id]; old != nil {
		if old.key != key {
			return PreviewState{}, fmt.Errorf("pcBusy")
		}
		return p.state(id, old), nil
	}
	if len(p.leases) >= 32 {
		return PreviewState{}, fmt.Errorf("pcBusy")
	}
	w := p.works[key]
	if w != nil && (w.state.Status == "failed" || w.state.Status == "cancelled") {
		w = nil
	}
	if w != nil && w.state.Status == "ready" && !p.cachedValid(key, w.extension) {
		w = nil
	}
	if w == nil {
		w = &previewWork{key: key, source: file, size: info.Size(), modified: info.ModTime().UnixNano(), state: PreviewState{Status: "queued"}}
		for _, ext := range []string{"mp4", "m4a"} {
			if p.cachedValid(key, ext) {
				w.extension = ext
				w.state = PreviewState{Status: "ready", Progress: 100, Cached: true, Path: filepath.Join(p.root, key+"."+ext)}
				break
			}
		}
		if w.state.Status != "ready" {
			entries, e := p.entries()
			if e != nil {
				return PreviewState{}, e
			}
			for _, entry := range entries {
				if entry.key == key {
					if p.pinned(key) {
						return PreviewState{}, fmt.Errorf("pcBusy")
					}
					if e = p.remove(entry); e != nil {
						return PreviewState{}, e
					}
				}
			}
		}
		p.works[key] = w
		if w.state.Status != "ready" {
			ctx, cancel := context.WithTimeout(context.Background(), 8*time.Hour)
			w.cancel = cancel
			go p.run(ctx, w)
		}
	}
	p.leases[id] = w
	return p.state(id, w), nil
}
func (p *PreviewCache) cachedValid(key, ext string) bool {
	metaInfo, err := os.Lstat(filepath.Join(p.root, key+".json"))
	if err != nil || !metaInfo.Mode().IsRegular() || metaInfo.Size() > 2048 {
		return false
	}
	raw, err := os.ReadFile(filepath.Join(p.root, key+".json"))
	if err != nil {
		return false
	}
	var meta previewMeta
	if json.Unmarshal(raw, &meta) != nil || meta.Version != 1 || meta.Bytes <= 0 || meta.Bytes > previewFileLimit {
		return false
	}
	info, err := os.Lstat(filepath.Join(p.root, key+"."+ext))
	return err == nil && info.Mode().IsRegular() && info.Size() == meta.Bytes && info.ModTime().UnixNano() == meta.Modified
}
func (p *PreviewCache) Get(id string) (PreviewState, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	w := p.leases[id]
	if w == nil {
		return PreviewState{}, fmt.Errorf("pcExpired")
	}
	return p.state(id, w), nil
}
func (p *PreviewCache) Release(id string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	w := p.leases[id]
	delete(p.leases, id)
	if w == nil {
		return
	}
	for _, other := range p.leases {
		if other == w {
			return
		}
	}
	if w.cancel != nil && (w.state.Status == "queued" || w.state.Status == "running") {
		w.cancel()
		w.state.Status = "cancelled"
	}
	if p.works[w.key] == w {
		delete(p.works, w.key)
	}
}
func (p *PreviewCache) pinned(key string) bool {
	for _, w := range p.leases {
		if w.key == key {
			return true
		}
	}
	w := p.works[key]
	return w != nil && (w.state.Status == "queued" || w.state.Status == "running")
}

type previewEntry struct {
	key      string
	files    []string
	bytes    int64
	modified time.Time
}

func (p *PreviewCache) entries() ([]previewEntry, error) {
	if err := p.ensureRoot(); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(p.root)
	if err != nil {
		return nil, err
	}
	groups := map[string]*previewEntry{}
	for _, entry := range entries {
		m := previewCacheName.FindStringSubmatch(entry.Name())
		if m == nil {
			continue
		}
		info, err := os.Lstat(filepath.Join(p.root, entry.Name()))
		if err != nil || !info.Mode().IsRegular() {
			return nil, fmt.Errorf("pcCacheError")
		}
		g := groups[m[1]]
		if g == nil {
			g = &previewEntry{key: m[1], modified: info.ModTime()}
			groups[m[1]] = g
		}
		g.files = append(g.files, entry.Name())
		if m[2] != "json" {
			g.bytes += info.Size()
		}
	}
	result := make([]previewEntry, 0, len(groups))
	for _, g := range groups {
		result = append(result, *g)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].modified.Before(result[j].modified) })
	return result, nil
}
func (p *PreviewCache) infoLocked() (PreviewCacheInfo, error) {
	entries, err := p.entries()
	var info PreviewCacheInfo
	if err != nil {
		return info, err
	}
	for _, e := range entries {
		if e.bytes > 0 {
			info.Files++
			info.Bytes += e.bytes
		}
	}
	for _, w := range p.works {
		if w.state.Status == "queued" || w.state.Status == "running" {
			info.Busy++
		}
	}
	return info, nil
}
func (p *PreviewCache) Info() (PreviewCacheInfo, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.infoLocked()
}
func (p *PreviewCache) remove(e previewEntry) error {
	for _, name := range e.files {
		if err := os.Remove(filepath.Join(p.root, name)); err != nil {
			return fmt.Errorf("pcCacheError")
		}
	}
	delete(p.works, e.key)
	return nil
}
func (p *PreviewCache) Clear() (PreviewCacheInfo, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	entries, err := p.entries()
	if err != nil {
		return PreviewCacheInfo{}, err
	}
	for _, e := range entries {
		if !p.pinned(e.key) {
			if err = p.remove(e); err != nil {
				return PreviewCacheInfo{}, err
			}
		}
	}
	return p.infoLocked()
}
func (p *PreviewCache) makeRoom(bytes int64) error {
	entries, err := p.entries()
	if err != nil {
		return err
	}
	var total int64
	for _, e := range entries {
		total += e.bytes
	}
	for _, e := range entries {
		if total+bytes <= previewCacheLimit {
			break
		}
		if !p.pinned(e.key) {
			if err = p.remove(e); err != nil {
				return err
			}
			total -= e.bytes
		}
	}
	if total+bytes > previewCacheLimit {
		return fmt.Errorf("pcCacheFull")
	}
	return nil
}
func (p *PreviewCache) run(ctx context.Context, w *previewWork) {
	err := p.generate(ctx, w)
	p.mu.Lock()
	defer p.mu.Unlock()
	wasCancelled := ctx.Err() != nil
	if w.cancel != nil {
		w.cancel()
	}
	if wasCancelled && w.state.Status != "ready" {
		w.state.Status = "cancelled"
		w.state.Error = "pcCancelled"
		return
	}
	if err != nil {
		w.state.Status = "failed"
		w.state.Error = err.Error()
	} else {
		// Publish completion only after generate has cleaned its private workspace.
		w.state.Status = "ready"
		w.state.Progress = 100
	}
}
func (p *PreviewCache) generate(ctx context.Context, w *previewWork) (result error) {
	select {
	case p.converter.slots <- struct{}{}:
		defer func() { <-p.converter.slots }()
	case <-ctx.Done():
		return ctx.Err()
	}
	p.mu.Lock()
	w.state.Status = "running"
	p.mu.Unlock()
	source, err := p.converter.inspectMergeSource(ctx, w.source)
	if err != nil {
		return fmt.Errorf("pcUnavailable")
	}
	if source.duration <= 0 || source.duration > 8*time.Hour || (source.video < 0 && source.audio < 0) {
		return fmt.Errorf("pcUnsupported")
	}
	if source.transfer == "smpte2084" || source.transfer == "arib-std-b67" {
		return fmt.Errorf("pcHDR")
	}
	if source.video >= 0 && (source.width < 2 || source.height < 2 || source.width > 16384 || source.height > 16384) {
		return fmt.Errorf("pcUnsupported")
	}
	ext := "m4a"
	if source.video >= 0 {
		ext = "mp4"
	}
	dir, err := os.MkdirTemp(p.root, ".preview-")
	if err != nil {
		return fmt.Errorf("pcCacheError")
	}
	defer func() {
		if e := os.RemoveAll(dir); e != nil {
			logger.Errorf("Failed to clean compatible preview workspace: %v", e)
			if result == nil {
				result = fmt.Errorf("pcCacheError")
			}
		}
	}()
	receipt, _ := json.Marshal(struct {
		Version int
		Key     string
	}{1, w.key})
	if err = os.WriteFile(filepath.Join(dir, ".nyacatch-preview.json"), receipt, 0600); err != nil {
		return fmt.Errorf("pcCacheError")
	}
	output := filepath.Join(dir, "result."+ext)
	args := []string{"-hide_banner", "-nostdin", "-y", "-filter_threads", "1", "-threads", "2", "-protocol_whitelist", "file", "-copyts", "-start_at_zero", "-i", w.source}
	if source.video >= 0 {
		args = append(args, "-map", fmt.Sprintf("0:%d", source.video), "-vf", "scale=w='trunc(iw*sar/2)*2':h=ih,setsar=1,scale=w='min(iw,960)':h='min(ih,960)':force_original_aspect_ratio=decrease:force_divisible_by=2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-bf", "0", "-threads", "2", "-fps_mode:v", "passthrough", "-enc_time_base:v", "-1")
	}
	if source.audio >= 0 {
		args = append(args, "-map", fmt.Sprintf("0:%d", source.audio), "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-ac", "2")
	}
	args = append(args, "-map_metadata", "-1", "-map_chapters", "-1", "-sn", "-dn", "-movflags", "+faststart", "-fs", fmt.Sprint(previewFileLimit), output)
	err = p.converter.execute(ctx, args, source.duration, func(progress int) { p.mu.Lock(); defer p.mu.Unlock(); w.state.Progress = min(progress, 99) })
	if err != nil {
		return fmt.Errorf("pcGenerateFailed")
	}
	actual, err := p.converter.inspectMergeSource(ctx, output)
	if err != nil {
		return fmt.Errorf("pcGenerateFailed")
	}
	if (actual.video >= 0) != (source.video >= 0) || (actual.audio >= 0) != (source.audio >= 0) || math.Abs(float64(actual.duration-source.duration)) > float64(350*time.Millisecond) {
		return fmt.Errorf("pcTimeline")
	}
	if actual.video >= 0 && (actual.videoCodec != "h264" || actual.width > 960 || actual.height > 960) {
		return fmt.Errorf("pcGenerateFailed")
	}
	if actual.audio >= 0 && actual.audioCodec != "aac" {
		return fmt.Errorf("pcGenerateFailed")
	}
	info, err := os.Stat(w.source)
	if err != nil || info.Size() != w.size || info.ModTime().UnixNano() != w.modified {
		return fmt.Errorf("pcChanged")
	}
	file, err := os.Stat(output)
	if err != nil || file.Size() <= 0 || file.Size() >= previewFileLimit-(1<<20) {
		return fmt.Errorf("pcCacheFull")
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if err = p.makeRoom(file.Size()); err != nil {
		return err
	}
	destination := filepath.Join(p.root, w.key+"."+ext)
	if err = os.Rename(output, destination); err != nil {
		return fmt.Errorf("pcCacheError")
	}
	meta, _ := json.Marshal(previewMeta{Version: 1, Bytes: file.Size(), Modified: file.ModTime().UnixNano()})
	metaTemp := filepath.Join(dir, "meta.json")
	if err = os.WriteFile(metaTemp, meta, 0600); err == nil {
		err = os.Rename(metaTemp, filepath.Join(p.root, w.key+".json"))
	}
	if err != nil {
		os.Remove(destination)
		return fmt.Errorf("pcCacheError")
	}
	w.extension = ext
	w.state.Path = destination
	return nil
}
