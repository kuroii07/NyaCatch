package core

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

type xTestRunner struct {
	t        *testing.T
	infoPath string
	fail     bool
}

func (r *xTestRunner) Run(ctx context.Context, bin string, args []string, log func(string)) error {
	i := slices.Index(args, "--load-info-json")
	if i < 0 {
		r.t.Fatal("download reverted to broken original extractor")
	}
	r.infoPath = args[i+1]
	data, err := os.ReadFile(r.infoPath)
	if err != nil || !strings.Contains(string(data), `"formats"`) {
		r.t.Fatal("fresh metadata missing")
	}
	if slices.Contains(args, "--") {
		r.t.Fatal("original URL still passed alongside info document")
	}
	if r.fail {
		return errors.New("download interrupted")
	}
	out := filepath.Join(args[slices.Index(args, "--paths")+1], "clip.mp4")
	os.WriteFile(out, []byte("media"), 0600)
	report := args[slices.Index(args, "--print-to-file")+2]
	encoded, _ := json.Marshal(out)
	return os.WriteFile(report, encoded, 0600)
}

func TestXDownloadRefreshesMetadataAndCleansTemporaryFiles(t *testing.T) {
	dir := t.TempDir()
	r := &xTestRunner{t: t}
	d := &DownloaderSvc{binMap: map[DownloadType]string{TypeYoutube: "yt-dlp"}, runner: r}
	calls := 0
	d.publicMetadata = func(context.Context, string, string, string) ([]byte, error) {
		calls++
		return []byte(`{"formats":[{"format_id":"x-public-best"}]}`), nil
	}
	p := DownloadParams{Type: TypeYoutubeSingle, URL: "https://x.com/a/status/2113612120076251186?s=20", Name: "clip", Options: &MediaOptions{Version: 1, Mode: "video", Resolver: "x-public", SaveDir: dir, FormatID: "x-public-best"}}
	for _, fail := range []bool{true, false} {
		r.fail = fail
		success := false
		err := d.downloadMedia(context.Background(), p, Callbacks{OnOutput: func(string) { success = true }})
		if (err != nil) != fail || success == fail {
			t.Fatalf("wrong output status: %v %v", err, success)
		}
		if _, err := os.Stat(r.infoPath); !os.IsNotExist(err) {
			t.Fatal("temporary signed metadata retained")
		}
		entries, _ := os.ReadDir(dir)
		for _, entry := range entries {
			if strings.HasPrefix(entry.Name(), ".") {
				t.Fatalf("temporary report leaked: %s", entry.Name())
			}
		}
	}
	if calls != 2 || p.URL != "https://x.com/a/status/2113612120076251186?s=20" {
		t.Fatal("retry did not refresh or original URL changed")
	}
	for _, url := range []string{"https://youtube.com/watch?v=1", "https://x.com.evil/a/status/2113612120076251186"} {
		p.URL = url
		if _, err := BuildMediaArguments(p, ".", "report", ""); err == nil {
			t.Fatal("public route accepted another source")
		}
	}
	p.URL = "https://x.com/a/status/2113612120076251186"
	p.Options.FormatID = "old-format"
	if _, err := BuildMediaArguments(p, ".", "report", ""); err == nil {
		t.Fatal("changed quality silently accepted")
	}
}
