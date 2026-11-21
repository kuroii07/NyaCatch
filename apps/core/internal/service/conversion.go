package service

import (
	"caorushizi.cn/mediago/internal/core"
	"errors"
	"fmt"
	"os"
	"sync"

	"caorushizi.cn/mediago/internal/api/sse"
	"caorushizi.cn/mediago/internal/db"
	"caorushizi.cn/mediago/internal/db/repo"
	"caorushizi.cn/mediago/internal/logger"
)

var ErrInvalidConversionOptions = errors.New("invalid conversion options")

// ConversionService is the business logic layer for conversion records.
type ConversionService struct {
	repo      *repo.ConversionRepository
	converter *Converter
	hub       *sse.Hub
	mu        sync.Mutex
}

// NewConversionService creates a ConversionService.
func NewConversionService(repo *repo.ConversionRepository, converter *Converter, hub *sse.Hub) *ConversionService {
	return &ConversionService{repo: repo, converter: converter, hub: hub}
}

// AddConversionInput holds the input for adding a conversion record.
type AddConversionInput struct {
	Options      *core.ConversionOptions `json:"options,omitempty"`
	Name         *string                 `json:"name"`
	Path         string                  `json:"path"`
	OutputFormat string                  `json:"outputFormat"`
	Quality      string                  `json:"quality"`
}

// ConversionPaginatedResult holds the paginated result.
type ConversionPaginatedResult struct {
	Total int64            `json:"total"`
	List  []*db.Conversion `json:"list"`
}

// GetConversions retrieves conversion records with pagination.
func (s *ConversionService) GetConversions(current, pageSize int, kind string) (*ConversionPaginatedResult, error) {
	result, err := s.repo.FindWithPagination(current, pageSize, kind)
	if err != nil {
		return nil, err
	}
	return &ConversionPaginatedResult{
		Total: result.Total,
		List:  result.Items,
	}, nil
}

// AddConversion adds a conversion record.
func (s *ConversionService) AddConversion(input *AddConversionInput) (*db.Conversion, error) {
	if err := input.Options.Validate(input.OutputFormat); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidConversionOptions, err)
	}
	if !supportedConversionFormat(input.OutputFormat) {
		return nil, fmt.Errorf("unsupported output format")
	}
	if input.Quality != "high" && input.Quality != "medium" && input.Quality != "low" {
		return nil, fmt.Errorf("unsupported quality")
	}
	if input.Options != nil && input.Options.Merge != nil {
		if input.Path != input.Options.Merge.Paths[0] {
			return nil, fmt.Errorf("%w: merge source mismatch", ErrInvalidConversionOptions)
		}
		for _, file := range input.Options.Merge.Paths {
			info, err := os.Stat(file)
			if err != nil || !info.Mode().IsRegular() {
				return nil, fmt.Errorf("merge input file is unavailable")
			}
		}
	}
	info, err := os.Stat(input.Path)
	if err != nil || !info.Mode().IsRegular() {
		return nil, fmt.Errorf("input file is unavailable")
	}
	var savedOptions *core.ConversionOptions
	if input.Options != nil {
		snapshot := *input.Options
		if input.Options.Mux != nil {
			muxCopy := *input.Options.Mux
			snapshot.Mux = &muxCopy
			if err := s.converter.prepareMux(input.Path, input.OutputFormat, &snapshot); err != nil {
				return nil, fmt.Errorf("%w: %v", ErrInvalidConversionOptions, err)
			}
		}
		if input.Options.Compress != nil {
			compressedCopy := *input.Options.Compress
			if compressedCopy.CQ != nil {
				cq := *compressedCopy.CQ
				compressedCopy.CQ = &cq
			}
			if compressedCopy.Subtitle != nil {
				sub := *compressedCopy.Subtitle
				if sub.Style != nil {
					style := *sub.Style
					sub.Style = &style
				}
				compressedCopy.Subtitle = &sub
			}
			if compressedCopy.Trial != nil {
				trial := *compressedCopy.Trial
				compressedCopy.Trial = &trial
			}
			snapshot.Compress = &compressedCopy
			if _, err := s.converter.prepareCompression(input.Path, input.OutputFormat, &snapshot); err != nil {
				return nil, fmt.Errorf("%w: %v", ErrInvalidConversionOptions, err)
			}
		}
		if input.Options.Capture != nil {
			captureCopy := *input.Options.Capture
			snapshot.Capture = &captureCopy
		}
		if input.Options.Merge != nil {
			mergeCopy := *input.Options.Merge
			mergeCopy.Paths = append([]string(nil), mergeCopy.Paths...)
			snapshot.Merge = &mergeCopy
		}
		if input.Options.Trim != nil {
			rangeCopy := *input.Options.Trim
			snapshot.Trim = &rangeCopy
		}
		savedOptions = &snapshot
	}
	conv := &db.Conversion{
		Options:      savedOptions,
		Name:         input.Name,
		Path:         input.Path,
		OutputFormat: input.OutputFormat,
		Quality:      input.Quality,
		Status:       "pending",
	}
	return s.repo.Create(conv)
}

// DeleteConversion removes a conversion record.
func (s *ConversionService) DeleteConversion(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	conv, err := s.repo.FindByIDOrFail(id)
	if err != nil {
		return err
	}
	if conv.Status == "converting" {
		return fmt.Errorf("cannot remove a running conversion")
	}
	return s.repo.Delete(id)
}

// FindByIDOrFail looks up a conversion record by ID, returning an error if not found.
func (s *ConversionService) FindByIDOrFail(id int64) (*db.Conversion, error) {
	return s.repo.FindByIDOrFail(id)
}

// StartConversion begins an ffmpeg conversion for the given record.
func (s *ConversionService) StartConversion(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	conv, err := s.repo.FindByIDOrFail(id)
	if err != nil {
		return err
	}
	if conv.Status != "pending" && conv.Status != "failed" {
		return fmt.Errorf("conversion %d is not in a startable state (status: %s)", id, conv.Status)
	}

	ctx, err := s.converter.reserve(id)
	if err != nil {
		return err
	}
	// Register cancellation before exposing the running state.
	if err := s.repo.UpdateStatus(id, "converting", 0, "", nil); err != nil {
		s.converter.release(id)
		return err
	}

	s.hub.Broadcast("conversion-start", map[string]any{"id": id})

	// Run in background
	go func() {
		outputPath, convErr := s.converter.run(ctx, id, conv.Path, conv.OutputFormat, conv.Quality, func(progress int) {
			_ = s.repo.UpdateStatus(id, "converting", progress, "", nil)
			s.hub.Broadcast("conversion-progress", map[string]any{"id": id, "progress": progress})
		}, conv.Options)

		s.mu.Lock()
		defer s.mu.Unlock()
		if convErr != nil {
			errMsg := convErr.Error()
			_ = s.repo.UpdateStatus(id, "failed", 0, "", &errMsg)
			s.hub.Broadcast("conversion-failed", map[string]any{"id": id, "error": errMsg})
			logger.Errorf("Conversion %d failed: %v", id, convErr)
			return
		}

		_ = s.repo.UpdateStatus(id, "done", 100, outputPath, nil)
		s.hub.Broadcast("conversion-success", map[string]any{"id": id, "outputPath": outputPath})
		logger.Infof("Conversion %d completed: %s", id, outputPath)
	}()

	return nil
}

// StopConversion cancels a running conversion.
func (s *ConversionService) StopConversion(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	conv, err := s.repo.FindByIDOrFail(id)
	if err != nil {
		return err
	}
	if conv.Status != "converting" || !s.converter.Stop(id) {
		return fmt.Errorf("conversion is not running")
	}
	return nil
}
