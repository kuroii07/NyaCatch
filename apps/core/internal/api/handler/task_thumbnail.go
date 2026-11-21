package handler

import (
	"caorushizi.cn/mediago/internal/api/dto"
	"caorushizi.cn/mediago/internal/service"
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
)

type TaskThumbnailHandler struct{ thumbnails *service.TaskThumbnailService }

func NewTaskThumbnailHandler(thumbnails *service.TaskThumbnailService) *TaskThumbnailHandler {
	return &TaskThumbnailHandler{thumbnails: thumbnails}
}
func (h *TaskThumbnailHandler) Get(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		c.Status(http.StatusBadRequest)
		return
	}
	data, mime, err := h.thumbnails.Get(c.Request.Context(), id)
	if err != nil {
		c.Header("Cache-Control", "no-store")
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", "private, max-age=86400")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, mime, data)
}

func (h *TaskThumbnailHandler) Cache(c *gin.Context) {
	var data service.ThumbnailCacheInfo
	var err error
	if c.Request.Method == http.MethodDelete {
		data, err = h.thumbnails.ClearCache()
	} else {
		data, err = h.thumbnails.CacheInfo()
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, dto.ErrorResponse{Code: 500, Message: "Thumbnail cache unavailable"})
		return
	}
	c.JSON(http.StatusOK, dto.SuccessResponse{Success: true, Code: 200, Data: data})
}
