package handler

import (
	"caorushizi.cn/mediago/internal/api/dto"
	"caorushizi.cn/mediago/internal/service"
	"caorushizi.cn/mediago/pkg/collection"
	"github.com/gin-gonic/gin"
	"net/http"
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
	result, err := h.resolver.ResolveCollectionEntry(c.Request.Context(), request.URL, request.Collection)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, dto.ErrorResponse{Success: false, Code: 422, Message: err.Error()})
		return
	}
	h.playback.AttachThumbnails(result)
	c.JSON(http.StatusOK, dto.SuccessResponse{Success: true, Code: 200, Data: result})
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
