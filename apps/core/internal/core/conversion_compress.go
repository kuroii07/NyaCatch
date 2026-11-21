package core

import (
	"fmt"
	"math"
	"time"
)

type CompressionOptions struct {
	Encoder          string               `json:"encoder,omitempty"`
	CQ               *int                 `json:"cq,omitempty"`
	Subtitle         *CompressionSubtitle `json:"subtitle,omitempty"`
	Codec            string               `json:"codec"`
	CRF              int                  `json:"crf"`
	TargetBytes      int64                `json:"targetBytes,omitempty"`
	Preset           string               `json:"preset"`
	Audio            string               `json:"audio"`
	Bitrate          int                  `json:"bitrate,omitempty"`
	FPS              int                  `json:"fps,omitempty"`
	Trial            *TrimRange           `json:"trial,omitempty"`
	SourceBytes      int64                `json:"sourceBytes,omitempty"`
	SourceModifiedMs int64                `json:"sourceModifiedMs,omitempty"`
	DurationMs       int64                `json:"durationMs,omitempty"`
}

func (o *ConversionOptions) validateCompression(format string) error {
	c := o.Compress
	if c.Encoder != "" && c.Encoder != "cpu" && c.Encoder != "nvenc" {
		return fmt.Errorf("unsupported compression encoder")
	}
	if c.Encoder == "nvenc" {
		if c.CQ == nil || *c.CQ < 1 || *c.CQ > 51 || c.CRF != 0 || c.TargetBytes != 0 {
			return fmt.Errorf("NVENC requires CQ 1–51, no CRF and no target size; target-size two-pass encoding uses CPU")
		}
	} else if c.CQ != nil {
		return fmt.Errorf("CPU compression uses CRF, not CQ")
	}
	if err := c.Subtitle.Validate(); err != nil {
		return err
	}
	if o.Capture != nil || o.Trim != nil || o.Merge != nil || o.AudioBitrate != 0 || (format != "mp4" && format != "mkv") ||
		(c.Codec != "h264" && c.Codec != "hevc") || c.CRF < 0 || c.CRF > 51 ||
		(c.Preset != "fast" && c.Preset != "medium" && c.Preset != "slow") ||
		(c.Audio != "copy" && c.Audio != "aac") {
		return fmt.Errorf("invalid compression settings")
	}
	if c.TargetBytes != 0 && (c.TargetBytes < 1000000 || c.TargetBytes > 100000000000 || c.CRF != 0 || c.Audio != "aac") {
		return fmt.Errorf("target compression requires 1–100000 MB, AAC and no CRF")
	}
	if c.Audio == "copy" {
		if c.Bitrate != 0 {
			return fmt.Errorf("copied audio cannot change bitrate")
		}
	} else {
		switch c.Bitrate {
		case 64, 96, 128, 192, 256, 320:
		default:
			return fmt.Errorf("unsupported AAC bitrate")
		}
	}
	switch c.FPS {
	case 0, 24, 25, 30, 50, 60:
	default:
		return fmt.Errorf("unsupported compression frame rate")
	}
	if c.Trial != nil {
		r := c.Trial
		if r.StartMs < 0 || r.EndMs <= r.StartMs || r.EndMs-r.StartMs > 30000 || r.EndMs > math.MaxInt64/int64(time.Millisecond) || r.Name != "" {
			return fmt.Errorf("trial must be within 30 seconds")
		}
	}
	return nil
}

// Leave room for muxing and rate-control variance. Never truncate an output to meet a budget.
func CompressionTargetBitrate(targetBytes, durationMs int64, audioKbps int) (int, error) {
	if targetBytes < 1000000 || targetBytes > 100000000000 || durationMs <= 0 || audioKbps < 0 || audioKbps > 320 {
		return 0, fmt.Errorf("invalid compression size budget")
	}
	reserve := int64(math.Max(32768, math.Floor(float64(targetBytes)*.05)))
	rate := math.Floor(float64(targetBytes-reserve)*8000/float64(durationMs)) - float64(audioKbps*1000)
	if rate < 64000 || rate > 500000000 {
		return 0, fmt.Errorf("target size and duration require an unsupported video bitrate; adjust the size or AAC bitrate")
	}
	return int(rate), nil
}
