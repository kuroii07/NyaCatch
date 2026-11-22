package handler

import (
	"caorushizi.cn/mediago/internal/api/dto"
	"caorushizi.cn/mediago/internal/service"
	"caorushizi.cn/mediago/pkg/collection"
	"context"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"net/http"
	"strings"
)

type MediaHandler struct {
	resolver *service.MediaResolver
	playback *service.MediaPlayback
}

func NewMediaHandler(binDir string, config ConfigStore) *MediaHandler {
	resolver := service.NewMediaResolver(binDir)
	resolver.Config = config
	return &MediaHandler{resolver: resolver, playback: service.NewMediaPlayback(resolver)}
}

func (h *MediaHandler) CreatePlayback(c *gin.Context) {
	var request struct {
		URL        string `json:"url" binding:"required,max=8192"`
		Mode       string `json:"mode" binding:"required,oneof=video audio"`
		Resolver   string `json:"resolver" binding:"omitempty,oneof=x-public instagram-public"`
		ResourceID string `json:"resourceId" binding:"max=128"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(400, dto.ErrorResponse{Success: false, Code: 400, Message: "A valid media URL and playback mode are required"})
		return
	}
	result, err := h.playback.CreateResource(c.Request.Context(), request.URL, request.Mode, request.Resolver, request.ResourceID)
	if err != nil {
		c.JSON(422, dto.ErrorResponse{Success: false, Code: 422, Message: err.Error()})
		return
	}
	c.JSON(200, dto.SuccessResponse{Success: true, Code: 200, Data: result})
}

func (h *MediaHandler) StreamPlayback(c *gin.Context) {
	h.playback.Serve(c.Writer, c.Request, c.Param("session"), c.Param("track"))
}

func (h *MediaHandler) RemovePlayback(c *gin.Context) {
	h.playback.Remove(c.Param("session"))
	c.JSON(200, dto.SuccessResponse{Success: true, Code: 200})
}

func (h *MediaHandler) Preview(c *gin.Context) {
	var request struct {
		URL        string                `json:"url" binding:"required,max=8192"`
		Collection *collection.Selection `json:"collection,omitempty"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Success: false, Code: 400, Message: "A valid media URL is required"})
		return
	}
	if err := service.ValidateMediaURL(request.URL); err != nil {
		c.JSON(http.StatusBadRequest, dto.ErrorResponse{Success: false, Code: 400, Message: err.Error()})
		return
	}
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	streaming := strings.Contains(c.GetHeader("Accept"), "application/x-ndjson")
	emit := func(value any) {
		if ctx.Err() != nil {
			return
		}
		data, err := json.Marshal(value)
		if err != nil {
			cancel()
			return
		}
		if _, err = c.Writer.Write(append(data, '\n')); err != nil {
			cancel()
			return
		}
		c.Writer.Flush()
	}
	if streaming {
		c.Header("Content-Type", "application/x-ndjson; charset=utf-8")
		c.Header("Cache-Control", "no-store")
		c.Header("X-Accel-Buffering", "no")
		ctx = service.WithMediaParseProgress(ctx, func(stage string) {
			emit(gin.H{"type": "progress", "stage": stage})
		})
		emit(gin.H{"type": "progress", "stage": "primary"})
	}
	result, err := h.resolver.ResolveCollectionEntry(ctx, request.URL, request.Collection)
	if err != nil {
		failure := service.MediaParseFailureDetails(err)
		if streaming {
			emit(gin.H{"type": "error", "message": err.Error(), "failure": failure})
		} else {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"success": false, "code": 422, "message": err.Error(), "failure": failure})
		}
		return
	}
	h.playback.AttachThumbnails(result)
	if streaming {
		emit(gin.H{"type": "result", "data": result})
	} else {
		c.JSON(http.StatusOK, dto.SuccessResponse{Success: true, Code: 200, Data: result})
	}
}

func (h *MediaHandler) Collection(c *gin.Context) {
	var request struct {
		URL  string `json:"url" binding:"required,max=8192"`
		Page int    `json:"page" binding:"required,min=1,max=2000"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(400, dto.ErrorResponse{Success: false, Code: 400, Message: "A collection URL and valid page are required"})
		return
	}
	result, err := h.resolver.DiscoverCollection(c.Request.Context(), request.URL, request.Page)
	if err != nil {
		c.JSON(422, dto.ErrorResponse{Success: false, Code: 422, Message: err.Error()})
		return
	}
	c.JSON(200, dto.SuccessResponse{Success: true, Code: 200, Data: result})
}
