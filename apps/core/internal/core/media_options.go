package core

import (
	"caorushizi.cn/mediago/pkg/collection"
	"caorushizi.cn/mediago/pkg/postmedia"
	"caorushizi.cn/mediago/pkg/xmedia"
	"errors"
	"path/filepath"
	"regexp"
	"slices"
)

type MediaOptions struct {
	Collection    *collection.Selection `json:"collection,omitempty"`
	Version       int                   `json:"version"`
	Mode          string                `json:"mode"`
	FormatID      string                `json:"formatId,omitempty"`
	AudioFormatID string                `json:"audioFormatId,omitempty"`
	AudioFormat   string                `json:"audioFormat,omitempty"`
	AudioBitrate  int                   `json:"audioBitrate,omitempty"`
	Container     string                `json:"container,omitempty"`
	SaveDir       string                `json:"saveDir,omitempty"`
	Source        string                `json:"source,omitempty"`
	Resolver      string                `json:"resolver,omitempty"`
	ResourceID    string                `json:"resourceId,omitempty"`
}

var formatIdentifier = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)

func (o *MediaOptions) Validate() error {
	if o == nil {
		return nil
	}
	if o.Version != 1 || !slices.Contains([]string{"video", "audio", "cover", "image"}, o.Mode) {
		return errors.New("unsupported media output options")
	}
	for _, id := range []string{o.FormatID, o.AudioFormatID, o.ResourceID} {
		if id != "" && !formatIdentifier.MatchString(id) {
			return errors.New("invalid media format identifier")
		}
	}
	if !slices.Contains([]string{"", "original", "mp3"}, o.AudioFormat) || !slices.Contains([]int{0, 128, 192, 320}, o.AudioBitrate) {
		return errors.New("unsupported audio format or bitrate")
	}
	if !slices.Contains([]string{"", "mp4", "webm", "mkv"}, o.Container) {
		return errors.New("unsupported video container")
	}
	if o.SaveDir != "" && !filepath.IsAbs(o.SaveDir) {
		return errors.New("download directory must be absolute")
	}
	if len(o.Source) > 100 {
		return errors.New("media source is too long")
	}
	if o.Resolver != "" && o.Resolver != xmedia.Resolver && o.Resolver != postmedia.InstagramResolver && o.Resolver != postmedia.XhsResolver && o.Resolver != postmedia.DouyinResolver {
		return errors.New("unsupported media resolver")
	}
	if o.Resolver == xmedia.Resolver && ((o.FormatID != "" && o.FormatID != "x-public-best") || o.AudioFormatID != "") {
		return errors.New("selected format is unavailable on the public X route")
	}
	if o.Resolver == postmedia.XhsResolver && (o.Mode != "image" || o.FormatID != "" || o.AudioFormatID != "") {
		return errors.New("Xiaohongshu image route requires an image resource")
	}
	if o.Resolver == postmedia.DouyinResolver && (o.ResourceID == "" || (o.FormatID != "" && o.FormatID != "douyin-browser-best") || o.AudioFormatID != "") {
		return errors.New("unsupported Douyin resource selection")
	}
	if o.Mode == "image" && (o.ResourceID == "" || o.Resolver == "" || o.FormatID != "" || o.AudioFormatID != "") {
		return errors.New("original image requires an exact public post resource")
	}
	return nil
}

func (o *MediaOptions) ValidateSource(source string) error {
	if err := o.Validate(); err != nil {
		return err
	}
	if o != nil && o.Collection != nil {
		if o.Resolver != "" || o.ResourceID != "" || o.Mode == "image" {
			return errors.New("collection video cannot use a single-post resolver")
		}
		if err := collection.Validate(source, o.Collection); err != nil {
			return err
		}
	}
	if o != nil && o.Resolver == xmedia.Resolver {
		_, err := xmedia.StatusID(source)
		return err
	}
	if o != nil && o.Resolver == postmedia.InstagramResolver {
		_, err := postmedia.InstagramID(source)
		return err
	}
	if o != nil && o.Resolver == postmedia.XhsResolver {
		_, err := postmedia.XhsID(source)
		return err
	}
	if o != nil && o.Resolver == postmedia.DouyinResolver {
		return postmedia.ValidateDouyinSource(source)
	}
	if o != nil && o.ResourceID != "" {
		if _, err := postmedia.InstagramID(source); err != nil {
			_, err = xmedia.StatusID(source)
			return err
		}
	}
	return nil
}
