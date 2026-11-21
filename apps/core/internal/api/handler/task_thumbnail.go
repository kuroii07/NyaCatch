package handler

import (
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
