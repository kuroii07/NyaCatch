package handler

import (
	"caorushizi.cn/mediago/internal/api/dto"
	"caorushizi.cn/mediago/internal/service"
	"github.com/gin-gonic/gin"
	"net/http"
)

func (h *ConversionHandler) PreviewCache(c *gin.Context) {
	cache := h.svc.Previews
	if cache == nil {
		c.JSON(503, dto.ErrorResponse{Success: false, Code: 503, Message: "pcUnavailable"})
		return
	}
	var result any
	var err error
	id := c.Param("preview")
	switch {
	case id != "" && c.Request.Method == http.MethodGet:
		result, err = cache.Get(id)
	case id != "" && c.Request.Method == http.MethodDelete:
		cache.Release(id)
		result = true
	case c.Request.Method == http.MethodPost:
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 65536)
		var req struct {
			Path string `json:"path"`
			ID   string `json:"id"`
		}
		if err = c.ShouldBindJSON(&req); err == nil {
			var value service.PreviewState
			value, err = cache.Start(req.Path, req.ID)
			result = value
			if c.Request.Context().Err() != nil {
				cache.Release(value.ID)
			}
		}
	case c.Request.Method == http.MethodDelete:
		result, err = cache.Clear()
	default:
		result, err = cache.Info()
	}
	if err != nil {
		c.JSON(400, dto.ErrorResponse{Success: false, Code: 400, Message: err.Error()})
		return
	}
	c.JSON(200, dto.SuccessResponse{Success: true, Code: 200, Data: result})
}
