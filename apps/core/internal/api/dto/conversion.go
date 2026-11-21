package dto

import "caorushizi.cn/mediago/internal/core"

// AddConversionReq Add conversion record request.
type AddConversionReq struct {
	Options      *core.ConversionOptions `json:"options,omitempty"`
	Name         *string                 `json:"name"`
	Path         string                  `json:"path" binding:"required"`
	OutputFormat string                  `json:"outputFormat" binding:"required"`
	Quality      string                  `json:"quality" binding:"required"`
}

// ConversionPaginationReq Paginated query request.
type ConversionPaginationReq struct {
	Current  int    `form:"current" json:"current"`
	PageSize int    `form:"pageSize" json:"pageSize"`
	Kind     string `form:"kind" json:"kind" binding:"omitempty,oneof=video audio image trim merge capture compress mux"`
}
