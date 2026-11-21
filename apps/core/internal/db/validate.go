package db

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ValidateSQLite checks a task database in read-only mode without migrating or
// changing the source file.
func ValidateSQLite(dbPath string) error {
	if strings.TrimSpace(dbPath) == "" {
		return fmt.Errorf("database path is empty")
	}
	readOnlyDSN := "file:" + filepath.ToSlash(dbPath) + "?mode=ro"
	database, err := gorm.Open(sqlite.Open(readOnlyDSN), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return fmt.Errorf("open SQLite database: %w", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		return fmt.Errorf("get SQLite connection: %w", err)
	}
	defer sqlDB.Close()

	var results []string
	if err := database.Raw("PRAGMA quick_check").Scan(&results).Error; err != nil {
		return fmt.Errorf("check SQLite integrity: %w", err)
	}
	if len(results) != 1 || results[0] != "ok" {
		return fmt.Errorf("SQLite integrity check failed: %s", strings.Join(results, "; "))
	}
	var taskTable string
	if err := database.Raw("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'video'").Scan(&taskTable).Error; err != nil {
		return fmt.Errorf("check task table: %w", err)
	}
	if taskTable != "video" {
		return fmt.Errorf("SQLite database does not contain the task table")
	}
	return nil
}
