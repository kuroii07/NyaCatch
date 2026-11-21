package service

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLegacyFileLookupAcceptsLiteralNamesWithOrWithoutExtension(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"legacy.mp4", "clip[1].mp4", "stem.mp4"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("media"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"legacy.mp4", "clip[1].mp4", "stem"} {
		exists, file := CheckFileExists(name, dir)
		if !exists || file == "" {
			t.Errorf("existing legacy file unavailable: %q", name)
		}
	}
	if exists, _ := CheckFileExists("clip*", dir); exists {
		t.Fatal("literal name was treated as a glob")
	}
}
