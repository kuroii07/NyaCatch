package postmedia

import (
	"os"
	"path/filepath"
)

// Limit this adapter to the bundled plugin, preserving the normal video path.
func PluginArguments(binaryDir, source string) []string {
	if _, err := InstagramID(source); err != nil {
		return nil
	}
	dir := filepath.Join(binaryDir, "plugins")
	if _, err := os.Stat(filepath.Join(dir, "nyacatch", "yt_dlp_plugins", "extractor", "nyacatch_instagram.py")); err != nil {
		return nil
	}
	return []string{"--no-plugin-dirs", "--plugin-dirs", dir, "--ignore-no-formats-error"}
}
