// Package collection enumerates finite public collections without creating tasks.
package collection

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"caorushizi.cn/mediago/pkg/postmedia"
)

const PageSize = 50

type Selection struct {
	SourceURL string `json:"sourceUrl"`
	ID        string `json:"id"`
	CID       string `json:"cid,omitempty"`
	MediaID   string `json:"mediaId,omitempty"`
	Index     int    `json:"index"`
}
type Entry struct {
	ID        string    `json:"id"`
	URL       string    `json:"url"`
	Title     string    `json:"title"`
	Index     int       `json:"index"`
	Duration  float64   `json:"duration"`
	Available bool      `json:"available"`
	Selection Selection `json:"selection"`
}
type Page struct {
	URL     string  `json:"url"`
	Title   string  `json:"title"`
	Source  string  `json:"source"`
	Kind    string  `json:"kind"`
	Entries []Entry `json:"entries"`
	Total   int     `json:"total"`
	Page    int     `json:"page"`
	HasMore bool    `json:"hasMore"`
}

var videoPath = regexp.MustCompile(`^/video/(BV[0-9A-Za-z]{10})/?$`)
var listPath = regexp.MustCompile(`^/([0-9]+)/lists/([0-9]+)/?$`)
var oldListPath = regexp.MustCompile(`^/([0-9]+)/channel/collectiondetail/?$`)
var youtubeID = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
var playlistID = regexp.MustCompile(`^[A-Za-z0-9_-]{2,150}$`)

func ParseURL(source string) (*url.URL, error) {
	u, err := url.Parse(source)
	if err != nil || u.User != nil || u.Port() != "" || (u.Scheme != "https" && u.Scheme != "http") {
		return nil, errors.New("invalid collection URL")
	}
	return u, nil
}
func BilibiliID(source string) string {
	u, e := ParseURL(source)
	if e != nil || (u.Hostname() != "www.bilibili.com" && u.Hostname() != "bilibili.com") {
		return ""
	}
	m := videoPath.FindStringSubmatch(u.Path)
	if m == nil {
		return ""
	}
	return m[1]
}
func YouTubeVideoID(source string) string {
	u, e := ParseURL(source)
	if e != nil {
		return ""
	}
	id := ""
	switch u.Hostname() {
	case "www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com":
		if u.Path == "/watch" {
			id = u.Query().Get("v")
		}
	case "youtu.be":
		id = strings.TrimPrefix(u.Path, "/")
	}
	if !youtubeID.MatchString(id) {
		return ""
	}
	return id
}
func Kind(source string) string {
	if BilibiliID(source) != "" {
		return "bilibili"
	}
	u, e := ParseURL(source)
	if e != nil {
		return ""
	}
	if u.Hostname() == "space.bilibili.com" && (listPath.MatchString(u.Path) || oldListPath.MatchString(u.Path)) {
		return "bilibili"
	}
	if (u.Hostname() == "www.youtube.com" || u.Hostname() == "youtube.com" || u.Hostname() == "m.youtube.com" || u.Hostname() == "music.youtube.com") && (u.Path == "/playlist" || u.Path == "/watch") && playlistID.MatchString(u.Query().Get("list")) {
		return "youtube"
	}
	return ""
}
func Validate(source string, s *Selection) error {
	if s == nil {
		return nil
	}
	if len(s.SourceURL) > 8192 || Kind(s.SourceURL) == "" || s.Index < 1 || s.Index > 100000 {
		return errors.New("invalid collection selection")
	}
	if id := BilibiliID(source); id != "" {
		if s.CID != "" {
			if _, e := strconv.ParseUint(s.CID, 10, 64); e != nil || s.CID == "0" || s.ID != "bili-"+id+"-"+s.CID {
				return errors.New("invalid Bilibili part identity")
			}
		}
		if s.CID == "" && s.ID != "bili-"+id {
			return errors.New("invalid Bilibili video identity")
		}
		if Kind(s.SourceURL) != "bilibili" {
			return errors.New("collection source mismatch")
		}
		return nil
	}
	if id := YouTubeVideoID(source); id != "" && s.MediaID == id && s.ID == "youtube-"+id && s.CID == "" && Kind(s.SourceURL) == "youtube" {
		return nil
	}
	return errors.New("collection entry does not match its video URL")
}

type BilibiliClient struct{ HTTP *http.Client }

func (b *BilibiliClient) get(ctx context.Context, path string, destination any) error {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.bilibili.com"+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	req.Header.Set("Referer", "https://www.bilibili.com/")
	response, err := b.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("Bilibili collection request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return fmt.Errorf("Bilibili collection HTTP %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 8*1024*1024+1))
	if err != nil {
		return err
	}
	if len(data) > 8*1024*1024 {
		return errors.New("collection metadata exceeds limit")
	}
	var envelope struct {
		Code    int             `json:"code"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data"`
	}
	if json.Unmarshal(data, &envelope) != nil {
		return errors.New("invalid Bilibili collection response")
	}
	if envelope.Code != 0 {
		return fmt.Errorf("Bilibili collection unavailable (%d): %s", envelope.Code, envelope.Message)
	}
	return json.Unmarshal(envelope.Data, destination)
}

type biliView struct {
	Title string `json:"title"`
	Pages []struct {
		Page     int     `json:"page"`
		CID      int64   `json:"cid"`
		Part     string  `json:"part"`
		Duration float64 `json:"duration"`
	} `json:"pages"`
	Season *struct {
		ID    int64  `json:"id"`
		Mid   int64  `json:"mid"`
		Title string `json:"title"`
	} `json:"ugc_season"`
}

func (b *BilibiliClient) view(ctx context.Context, id string) (biliView, error) {
	var v biliView
	e := b.get(ctx, "/x/web-interface/view?bvid="+id, &v)
	return v, e
}
func (b *BilibiliClient) Discover(ctx context.Context, source string, page int) (*Page, error) {
	if page < 1 || page > 2000 {
		return nil, errors.New("invalid collection page")
	}
	id := BilibiliID(source)
	u, err := ParseURL(source)
	if err != nil {
		return nil, err
	}
	var mid, sid string
	if id != "" {
		v, e := b.view(ctx, id)
		if e != nil {
			return nil, e
		}
		if len(v.Pages) > 1 {
			result := &Page{URL: source, Title: v.Title, Source: "Bilibili", Kind: "bilibili-parts", Total: len(v.Pages), Page: page, Entries: []Entry{}}
			start := (page - 1) * PageSize
			end := min(start+PageSize, len(v.Pages))
			result.HasMore = end < len(v.Pages)
			for i := start; i < end; i++ {
				part := v.Pages[i]
				cid := strconv.FormatInt(part.CID, 10)
				child := *u
				q := child.Query()
				q.Set("p", strconv.Itoa(part.Page))
				child.RawQuery = q.Encode()
				entryID := "bili-" + id + "-" + cid
				result.Entries = append(result.Entries, Entry{ID: entryID, URL: child.String(), Title: part.Part, Index: i + 1, Duration: part.Duration, Available: part.CID > 0, Selection: Selection{SourceURL: source, ID: entryID, CID: cid, Index: i + 1}})
			}
			return result, nil
		}
		if v.Season == nil {
			return nil, nil
		}
		mid = strconv.FormatInt(v.Season.Mid, 10)
		sid = strconv.FormatInt(v.Season.ID, 10)
	} else {
		if u.Hostname() != "space.bilibili.com" {
			return nil, errors.New("unsupported collection URL")
		}
		if m := listPath.FindStringSubmatch(u.Path); m != nil {
			mid, sid = m[1], m[2]
			if u.Query().Get("type") == "series" {
				return nil, errors.New("Bilibili series lists are not supported yet")
			}
		} else if m := oldListPath.FindStringSubmatch(u.Path); m != nil {
			mid, sid = m[1], u.Query().Get("sid")
		} else {
			return nil, errors.New("unsupported collection URL")
		}
	}
	if _, e := strconv.ParseUint(mid, 10, 64); e != nil {
		return nil, errors.New("invalid collection owner")
	}
	if _, e := strconv.ParseUint(sid, 10, 64); e != nil {
		return nil, errors.New("invalid collection identifier")
	}
	var list struct {
		Meta struct {
			Name string `json:"name"`
		} `json:"meta"`
		Page struct {
			Total int `json:"total"`
		} `json:"page"`
		Archives []struct {
			BVID     string  `json:"bvid"`
			Title    string  `json:"title"`
			Duration float64 `json:"duration"`
		} `json:"archives"`
	}
	endpoint := fmt.Sprintf("/x/polymer/web-space/seasons_archives_list?mid=%s&season_id=%s&page_num=%d&page_size=%d&sort_reverse=false", mid, sid, page, PageSize)
	if err := b.get(ctx, endpoint, &list); err != nil {
		return nil, err
	}
	result := &Page{URL: source, Title: list.Meta.Name, Source: "Bilibili", Kind: "bilibili-season", Total: list.Page.Total, Page: page, Entries: []Entry{}, HasMore: page*PageSize < list.Page.Total}
	if len(list.Archives) > PageSize {
		return nil, errors.New("collection page exceeds limit")
	}
	for i, a := range list.Archives {
		child := "https://www.bilibili.com/video/" + a.BVID + "/?p=1"
		if BilibiliID(child) == "" {
			return nil, errors.New("invalid collection video")
		}
		entryID := "bili-" + a.BVID
		index := (page-1)*PageSize + i + 1
		result.Entries = append(result.Entries, Entry{ID: entryID, URL: child, Title: a.Title, Duration: a.Duration, Index: index, Available: true, Selection: Selection{SourceURL: source, ID: entryID, Index: index}})
	}
	return result, nil
}
func NewBilibiliClient(proxy string) (*BilibiliClient, func(), error) {
	client, close, err := postmedia.Client(proxy)
	if err != nil {
		return nil, nil, err
	}
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) > 2 || req.URL.Scheme != "https" || req.URL.Host != "api.bilibili.com" {
			return errors.New("unexpected collection redirect")
		}
		return nil
	}
	return &BilibiliClient{HTTP: client}, close, nil
}

// RefreshPart follows the saved CID after a creator reorders a multi-part upload.
func RefreshPart(ctx context.Context, source string, s *Selection, proxy string) (string, error) {
	if err := Validate(source, s); err != nil {
		return "", err
	}
	if s == nil || s.CID == "" {
		return source, nil
	}
	client, close, err := NewBilibiliClient(proxy)
	if err != nil {
		return "", err
	}
	defer close()
	return client.RefreshPart(ctx, source, s)
}
func (b *BilibiliClient) RefreshPart(ctx context.Context, source string, s *Selection) (string, error) {
	if err := Validate(source, s); err != nil {
		return "", err
	}
	v, err := b.view(ctx, BilibiliID(source))
	if err != nil {
		return "", err
	}
	for _, part := range v.Pages {
		if strconv.FormatInt(part.CID, 10) == s.CID {
			u, _ := url.Parse(source)
			q := u.Query()
			q.Set("p", strconv.Itoa(part.Page))
			u.RawQuery = q.Encode()
			return u.String(), nil
		}
	}
	return "", errors.New("selected Bilibili part is no longer available; the original CID was not found")
}
