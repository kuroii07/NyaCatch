package service

import (
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"time"

	"caorushizi.cn/mediago/internal/core"
)

type CompressionEncoderStatus struct {
	Available bool `json:"available"`
}
type CompressionEncoders struct {
	H264 CompressionEncoderStatus `json:"h264"`
	HEVC CompressionEncoderStatus `json:"hevc"`
}

// Listing an encoder does not prove driver support. Initialize and encode real
// frames with the same rate control used by export; never read the user's media.
func (c *Converter) CompressionEncoders(parent context.Context, refresh bool) (CompressionEncoders, error) {
	ctx, cancel := context.WithTimeout(parent, 15*time.Second)
	defer cancel()
	requested := time.Now()
	select {
	case c.encoderGate <- struct{}{}:
		defer func() { <-c.encoderGate }()
	case <-ctx.Done():
		return CompressionEncoders{}, ctx.Err()
	}
	if !c.encoderChecked.IsZero() && ((!refresh && time.Since(c.encoderChecked) < time.Minute) || c.encoderChecked.After(requested)) {
		return c.encoderCache, nil
	}
	select {
	case c.slots <- struct{}{}:
		defer func() { <-c.slots }()
	case <-ctx.Done():
		return CompressionEncoders{}, ctx.Err()
	}
	probe := func(codec string) bool {
		probeCtx, stop := context.WithTimeout(ctx, 6*time.Second)
		defer stop()
		cq := 23
		o := &core.CompressionOptions{Encoder: "nvenc", Codec: codec, CQ: &cq, Preset: "medium"}
		args := []string{"-hide_banner", "-nostdin", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-frames:v", "4", "-an"}
		args = append(args, compressionVideoArgs(o)...)
		args = append(args, "-f", "null", "-")
		cmd := exec.CommandContext(probeCtx, c.ffmpegBin, args...)
		configureMediaCommand(cmd)
		return cmd.Run() == nil
	}
	result := CompressionEncoders{H264: CompressionEncoderStatus{Available: probe("h264")}, HEVC: CompressionEncoderStatus{Available: probe("hevc")}}
	if ctx.Err() != nil {
		return CompressionEncoders{}, ctx.Err()
	}
	c.encoderCache, c.encoderChecked = result, time.Now()
	return result, nil
}

func (s *ConversionService) CompressionEncoders(ctx context.Context, refresh bool) (CompressionEncoders, error) {
	return s.converter.CompressionEncoders(ctx, refresh)
}

func (c *Converter) checkCompressionEncoder(o *core.CompressionOptions) error {
	if o.Encoder != "nvenc" {
		return nil
	}
	status, err := c.CompressionEncoders(context.Background(), false)
	if err != nil {
		return fmt.Errorf("NVENC detection failed: %w", err)
	}
	if (o.Codec == "h264" && !status.H264.Available) || (o.Codec == "hevc" && !status.HEVC.Available) {
		return fmt.Errorf("NVIDIA NVENC is unavailable for %s; check your GPU/driver or select CPU", o.Codec)
	}
	return nil
}

func compressionVideoArgs(o *core.CompressionOptions) []string {
	encoder := "libx264"
	if o.Codec == "hevc" {
		encoder = "libx265"
	}
	if o.Encoder == "nvenc" {
		encoder = "h264_nvenc"
		if o.Codec == "hevc" {
			encoder = "hevc_nvenc"
		}
		preset := map[string]string{"fast": "p2", "medium": "p4", "slow": "p6"}[o.Preset]
		return []string{"-pix_fmt", "yuv420p", "-c:v", encoder, "-preset", preset, "-tune", "hq", "-rc", "vbr", "-cq", strconv.Itoa(*o.CQ), "-b:v", "0", "-fps_mode", "passthrough"}
	}
	args := []string{"-pix_fmt", "yuv420p", "-c:v", encoder, "-preset", o.Preset, "-threads", "2", "-fps_mode", "passthrough"}
	if o.TargetBytes == 0 {
		args = append(args, "-crf", strconv.Itoa(o.CRF))
		if o.Codec == "hevc" {
			args = append(args, "-x265-params", "pools=2:frame-threads=1:log-level=error")
		}
	}
	return args
}
