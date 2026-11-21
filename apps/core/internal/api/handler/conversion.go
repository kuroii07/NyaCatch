package handler

import (
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"

	"caorushizi.cn/mediago/internal/api/dto"
	"caorushizi.cn/mediago/internal/core"
	"caorushizi.cn/mediago/internal/i18n"
	"caorushizi.cn/mediago/internal/logger"
	"caorushizi.cn/mediago/internal/service"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func (h *ConversionHandler) Encoders(c *gin.Context) {
	status, err := h.svc.CompressionEncoders(c.Request.Context(), c.Query("refresh") == "1")
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, dto.ErrorResponse{Success: false, Code: 503, Message: err.Error()})
		return
	}
	c.JSON(200, dto.SuccessResponse{Success: true, Code: 200, Data: status})
}

func (h *ConversionHandler) MuxInspect(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32768)
	var req struct {
		Path            string `json:"path"`
		AudioPath       string `json:"audioPath"`
		SubtitlePath    string `json:"subtitlePath"`
		SubtitleHash    string `json:"subtitleHash"`
		ConvertSubtitle bool   `json:"convertSubtitle"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, dto.ErrorResponse{Success: false, Code: 400, Message: err.Error()})
		return
	}
	info, err := h.svc.InspectMux(c.Request.Context(), req.Path, req.AudioPath, &core.MuxOptions{SubtitlePath: req.SubtitlePath, SubtitleHash: req.SubtitleHash, ConvertSubtitle: req.ConvertSubtitle})
	if err != nil {
		c.JSON(400, dto.ErrorResponse{Success: false, Code: 400, Message: err.Error()})
		return
	}
	c.JSON(200, dto.SuccessResponse{Success: true, Code: 200, Data: info})
}

func (h *ConversionHandler) SubtitleInspect(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32768)
	var req struct {
		Path string `json:"path"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, dto.ErrorResponse{Success: false, Code: 400, Message: err.Error()})
		return
	}
	info, err := h.svc.InspectSubtitle(req.Path)
	if err != nil {
		c.JSON(400, dto.ErrorResponse{Success: false, Code: 400, Message: err.Error()})
		return
	}
	c.JSON(200, dto.SuccessResponse{Success: true, Code: 200, Data: info})
}
func (h *ConversionHandler) SubtitlePreview(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32768)
	var req struct {
		Path     string                    `json:"path"`
		MaxEdge  int                       `json:"maxEdge"`
		AtMs     int64                     `json:"atMs"`
		Subtitle *core.CompressionSubtitle `json:"subtitle"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, dto.ErrorResponse{Success: false, Code: 400, Message: err.Error()})
		return
	}
	raw, err := h.svc.PreviewSubtitle(c.Request.Context(), req.Path, req.MaxEdge, req.AtMs, req.Subtitle)
	if err != nil {
		c.JSON(400, dto.ErrorResponse{Success: false, Code: 400, Message: err.Error()})
		return
	}
	c.JSON(200, dto.SuccessResponse{Success: true, Code: 200, Data: gin.H{"url": "data:image/png;base64," + base64.StdEncoding.EncodeToString(raw), "atMs": req.AtMs}})
}

// ConversionHandler handles conversion record endpoints.
type ConversionHandler struct {
	svc *service.ConversionService
}

// NewConversionHandler creates a ConversionHandler.
func NewConversionHandler(svc *service.ConversionService) *ConversionHandler {
	return &ConversionHandler{svc: svc}
}

// List retrieves conversion records with pagination.
func (h *ConversionHandler) List(c *gin.Context) {
	var req dto.ConversionPaginationReq
	if err := c.ShouldBindQuery(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Success: false, Code: http.StatusBadRequest, Message: err.Error()})
		return
	}

	result, err := h.svc.GetConversions(req.Current, req.PageSize, req.Kind)
	if err != nil {
		logger.Error("Failed to get conversions", zap.Error(err))
		c.JSON(http.StatusInternalServerError, dto.ErrorResponse{Success: false, Code: http.StatusInternalServerError, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.SuccessResponse{Success: true, Code: http.StatusOK, Message: i18n.T(c, i18n.MsgOK), Data: result})
}

// Create adds a conversion record.
func (h *ConversionHandler) Create(c *gin.Context) {
	var req dto.AddConversionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Success: false, Code: http.StatusBadRequest, Message: err.Error()})
		return
	}

	conv, err := h.svc.AddConversion(&service.AddConversionInput{
		Name:         req.Name,
		Options:      req.Options,
		Path:         req.Path,
		OutputFormat: req.OutputFormat,
		Quality:      req.Quality,
	})
	if err != nil {
		logger.Error("Failed to add conversion", zap.Error(err))
		status := http.StatusInternalServerError
		if errors.Is(err, service.ErrInvalidConversionOptions) {
			status = http.StatusBadRequest
		}
		c.JSON(status, dto.ErrorResponse{Success: false, Code: status, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.SuccessResponse{Success: true, Code: http.StatusOK, Message: i18n.T(c, i18n.MsgOK), Data: conv})
}

// Delete removes a conversion record.
func (h *ConversionHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Success: false, Code: http.StatusBadRequest, Message: i18n.T(c, i18n.MsgInvalidID)})
		return
	}

	if err := h.svc.DeleteConversion(id); err != nil {
		logger.Error("Failed to delete conversion", zap.Error(err))
		c.JSON(http.StatusInternalServerError, dto.ErrorResponse{Success: false, Code: http.StatusInternalServerError, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.SuccessResponse{Success: true, Code: http.StatusOK, Message: i18n.T(c, i18n.MsgDeleted)})
}

// Get retrieves a single conversion record.
func (h *ConversionHandler) Get(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Success: false, Code: http.StatusBadRequest, Message: i18n.T(c, i18n.MsgInvalidID)})
		return
	}

	conv, err := h.svc.FindByIDOrFail(id)
	if err != nil {
		c.JSON(http.StatusNotFound, dto.ErrorResponse{Success: false, Code: http.StatusNotFound, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.SuccessResponse{Success: true, Code: http.StatusOK, Message: i18n.T(c, i18n.MsgOK), Data: conv})
}

// Start begins a conversion.
func (h *ConversionHandler) Start(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Success: false, Code: http.StatusBadRequest, Message: i18n.T(c, i18n.MsgInvalidID)})
		return
	}

	if err := h.svc.StartConversion(id); err != nil {
		logger.Error("Failed to start conversion", zap.Int64("id", id), zap.Error(err))
		c.JSON(http.StatusInternalServerError, dto.ErrorResponse{Success: false, Code: http.StatusInternalServerError, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.SuccessResponse{Success: true, Code: http.StatusOK, Message: i18n.T(c, i18n.MsgOK)})
}

// Stop cancels a running conversion.
func (h *ConversionHandler) Stop(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Success: false, Code: http.StatusBadRequest, Message: i18n.T(c, i18n.MsgInvalidID)})
		return
	}

	if err := h.svc.StopConversion(id); err != nil {
		logger.Error("Failed to stop conversion", zap.Int64("id", id), zap.Error(err))
		c.JSON(http.StatusInternalServerError, dto.ErrorResponse{Success: false, Code: http.StatusInternalServerError, Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.SuccessResponse{Success: true, Code: http.StatusOK, Message: i18n.T(c, i18n.MsgOK)})
}
