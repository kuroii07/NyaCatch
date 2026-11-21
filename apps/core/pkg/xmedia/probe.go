package xmedia

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type ProbeInfo struct {
	Width, Height          int
	Duration, FPS          float64
	VideoCodec, AudioCodec string
}

func parseProbe(data []byte) (ProbeInfo, error) {
	var raw struct {
		Streams []struct {
			Type   string `json:"codec_type"`
			Codec  string `json:"codec_name"`
			Width  int    `json:"width"`
			Height int    `json:"height"`
			FPS    string `json:"avg_frame_rate"`
		} `json:"streams"`
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return ProbeInfo{}, errors.New("invalid probe response")
	}
	p := ProbeInfo{AudioCodec: "none"}
	p.Duration, _ = strconv.ParseFloat(raw.Format.Duration, 64)
	for _, s := range raw.Streams {
		switch s.Type {
		case "video":
			p.Width, p.Height, p.VideoCodec = s.Width, s.Height, s.Codec
			parts := strings.Split(s.FPS, "/")
			if len(parts) == 2 {
				n, _ := strconv.ParseFloat(parts[0], 64)
				d, _ := strconv.ParseFloat(parts[1], 64)
				if d > 0 {
					p.FPS = n / d
				}
			}
		case "audio":
			if s.Codec == "" {
				return ProbeInfo{}, errors.New("probe could not identify the audio track")
			}
			p.AudioCodec = s.Codec
		}
	}
	if p.Width <= 0 || p.Height <= 0 || p.VideoCodec == "" || p.Duration <= 0 {
		return ProbeInfo{}, errors.New("probe did not confirm a finite video")
	}
	return p, nil
}

type probeOutput struct{ bytes.Buffer }

func (w *probeOutput) Write(p []byte) (int, error) {
	if w.Len()+len(p) > 256*1024 {
		return 0, errors.New("probe output exceeds size limit")
	}
	return w.Buffer.Write(p)
}

func probeRemote(ctx context.Context, binaryDir, source string, client *http.Client) (ProbeInfo, error) {
	ctx, cancel := context.WithTimeout(ctx, 18*time.Second)
	defer cancel()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return ProbeInfo{}, err
	}
	// A short-lived, fixed-target loopback stream lets Go honor HTTP/SOCKS
	// proxies for ffprobe without putting proxy credentials on its command line.
	token := "/" + rand.Text() + ".mp4"
	server := &http.Server{ReadHeaderTimeout: 3 * time.Second, BaseContext: func(net.Listener) context.Context { return ctx }, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != token || (r.Method != "GET" && r.Method != "HEAD") {
			http.NotFound(w, r)
			return
		}
		req, e := http.NewRequestWithContext(r.Context(), r.Method, source, nil)
		if e != nil {
			w.WriteHeader(502)
			return
		}
		req.Header.Set("User-Agent", "NyaCatch/preview")
		if value := r.Header.Get("Range"); value != "" {
			req.Header.Set("Range", value)
		}
		resp, e := client.Do(req)
		if e != nil {
			w.WriteHeader(502)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 && resp.StatusCode != 206 {
			w.WriteHeader(502)
			return
		}
		for _, h := range []string{"Content-Length", "Content-Type", "Content-Range", "Accept-Ranges"} {
			if v := resp.Header.Get(h); v != "" {
				w.Header().Set(h, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		if r.Method == "GET" {
			_, _ = io.Copy(w, resp.Body)
		}
	})}
	defer server.Close()
	go func() { _ = server.Serve(listener) }()
	name := "ffprobe"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	command := exec.CommandContext(ctx, filepath.Join(binaryDir, name), "-v", "error", "-rw_timeout", "12000000", "-protocol_whitelist", "http,tcp", "-format_whitelist", "mov", "-probesize", "1048576", "-analyzeduration", "2000000", "-show_streams", "-show_format", "-of", "json", "http://"+listener.Addr().String()+token)
	configureProbe(command)
	command.WaitDelay = time.Second
	output := &probeOutput{}
	command.Stdout = output
	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return ProbeInfo{}, ctx.Err()
		}
		return ProbeInfo{}, errors.New("ffprobe could not verify the public MP4")
	}
	return parseProbe(output.Bytes())
}
