package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateSQLite(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	database, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}
	if err := ValidateSQLite(path); err != nil {
		t.Fatalf("valid SQLite database rejected: %v", err)
	}

	if err := os.WriteFile(path, append([]byte("SQLite format 3\x00"), []byte("corrupt")...), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ValidateSQLite(path); err == nil {
		t.Fatal("corrupt SQLite database passed validation")
	}
}
