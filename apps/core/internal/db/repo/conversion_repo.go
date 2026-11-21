package repo

import (
	"errors"

	"caorushizi.cn/mediago/internal/db"
	"gorm.io/gorm"
)

// ErrConversionNotFound is returned when a conversion record is not found by ID.
var ErrConversionNotFound = errors.New("conversion_not_found")

// ConversionRepository is the data access layer for conversion records.
type ConversionRepository struct {
	db *gorm.DB
}

// NewConversionRepository creates a ConversionRepository.
func NewConversionRepository(database *db.Database) *ConversionRepository {
	return &ConversionRepository{db: database.DB}
}

// Create creates a conversion record.
func (r *ConversionRepository) Create(conv *db.Conversion) (*db.Conversion, error) {
	if err := r.db.Create(conv).Error; err != nil {
		return nil, err
	}
	return conv, nil
}

// FindByID looks up a conversion record by ID.
func (r *ConversionRepository) FindByID(id int64) (*db.Conversion, error) {
	var conv db.Conversion
	err := r.db.Where("id = ?", id).First(&conv).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &conv, nil
}

// FindByIDOrFail looks up a conversion record by ID, returning an error if not found.
func (r *ConversionRepository) FindByIDOrFail(id int64) (*db.Conversion, error) {
	conv, err := r.FindByID(id)
	if err != nil {
		return nil, err
	}
	if conv == nil {
		return nil, ErrConversionNotFound
	}
	return conv, nil
}

// ConversionPaginationResult holds the result of a paginated query.
type ConversionPaginationResult struct {
	Items []*db.Conversion `json:"items"`
	Total int64            `json:"total"`
}

// FindWithPagination queries conversion records with pagination.
func (r *ConversionRepository) FindWithPagination(current, pageSize int, kind string) (*ConversionPaginationResult, error) {
	if current <= 0 {
		current = 1
	}
	if pageSize <= 0 {
		pageSize = 50
	}

	query := r.db.Model(&db.Conversion{})
	audio := []string{"mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "original"}
	images := []string{"png", "jpg", "webp", "bmp"}
	switch kind {
	case "":
	case "video":
		query = query.Where("LOWER(COALESCE(outputFormat, '')) NOT IN ?", append(append([]string{}, audio...), images...))
	case "audio":
		query = query.Where("LOWER(COALESCE(outputFormat, '')) IN ?", audio)
	case "image":
		query = query.Where("LOWER(COALESCE(outputFormat, '')) IN ?", images)
	case "trim":
		query = query.Where("json_type(CASE WHEN json_valid(options) THEN options ELSE '{}' END, '$.trim') = 'object'")
	case "merge":
		query = query.Where("json_type(CASE WHEN json_valid(options) THEN options ELSE '{}' END, '$.merge') = 'object'")
	case "capture":
		query = query.Where("json_type(CASE WHEN json_valid(options) THEN options ELSE '{}' END, '$.capture') = 'object'")
	case "compress":
		query = query.Where("json_type(CASE WHEN json_valid(options) THEN options ELSE '{}' END, '$.compress') = 'object'")
	case "mux":
		query = query.Where("json_type(CASE WHEN json_valid(options) THEN options ELSE '{}' END, '$.mux') = 'object'")
	default:
		return nil, errors.New("invalid conversion category")
	}
	if kind != "" && kind != "mux" {
		query = query.Where("COALESCE(json_type(CASE WHEN json_valid(options) THEN options ELSE '{}' END, '$.mux'), '') != 'object'")
	}
	if kind != "" && kind != "capture" {
		query = query.Where("COALESCE(json_type(CASE WHEN json_valid(options) THEN options ELSE '{}' END, '$.capture'), '') != 'object'")
	}
	if kind != "" && kind != "compress" {
		query = query.Where("COALESCE(json_type(CASE WHEN json_valid(options) THEN options ELSE '{}' END, '$.compress'), '') != 'object'")
	}
	if kind == "video" || kind == "audio" || kind == "image" {
		// Trim jobs share the worker/table, but belong only to trim history.
		// Apply this before both count and pagination, retaining legacy NULL options.
		query = query.Where("COALESCE(json_type(CASE WHEN json_valid(options) THEN options ELSE '{}' END, '$.trim'), '') != 'object'")
		query = query.Where("COALESCE(json_type(CASE WHEN json_valid(options) THEN options ELSE '{}' END, '$.merge'), '') != 'object'")
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}

	var items []*db.Conversion
	offset := (current - 1) * pageSize
	err := query.Order("createdDate DESC").Order("id DESC").Offset(offset).Limit(pageSize).Find(&items).Error
	if err != nil {
		return nil, err
	}

	return &ConversionPaginationResult{Items: items, Total: total}, nil
}

// UpdateStatus updates the status, progress, outputPath, and error fields.
func (r *ConversionRepository) UpdateStatus(id int64, status string, progress int, outputPath string, errMsg *string) error {
	updates := map[string]any{
		"status":     status,
		"progress":   progress,
		"outputPath": outputPath,
		"error":      nil,
	}
	if errMsg != nil {
		updates["error"] = *errMsg
	}
	return r.db.Model(&db.Conversion{}).Where("id = ?", id).Updates(updates).Error
}

// An interrupted worker cannot resume across a core restart; keep the record retryable.
func (r *ConversionRepository) RecoverInterrupted() error {
	return r.db.Model(&db.Conversion{}).Where("status = ?", "converting").Updates(map[string]any{"status": "failed", "progress": 0, "error": "conversion interrupted; retry"}).Error
}

// Delete removes a conversion record.
func (r *ConversionRepository) Delete(id int64) error {
	return r.db.Delete(&db.Conversion{}, id).Error
}
