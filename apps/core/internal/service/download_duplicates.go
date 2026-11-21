package service

import (
	"caorushizi.cn/mediago/internal/core"
	"caorushizi.cn/mediago/pkg/postmedia"
	"caorushizi.cn/mediago/pkg/xmedia"
	"encoding/json"
	"fmt"
)

type DownloadDuplicate struct {
	Index  int    `json:"index"`
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

func duplicateIdentity(source string, options *core.MediaOptions) string {
	if options == nil {
		return ""
	}
	identity := source
	// Only known single-post routes may ignore share parameters. Arbitrary query strings remain significant.
	if id, err := xmedia.StatusID(source); err == nil {
		identity = "x:" + id
	} else if id, err := postmedia.InstagramID(source); err == nil {
		identity = "instagram:" + id
	} else if options.ResourceID != "" && (options.Resolver == postmedia.XhsResolver || options.Resolver == postmedia.DouyinResolver) {
		identity = options.Resolver + ":" + options.ResourceID
	}
	selection := *options
	if options.Collection != nil {
		identity = options.Collection.ID
		selection.Collection = nil
	}
	selection.SaveDir = ""
	selection.Source = ""
	selection.Resolver = ""
	data, _ := json.Marshal(selection)
	return identity + "\n" + string(data)
}

func (s *DownloadTaskService) FindDuplicates(inputs []*AddDownloadTaskInput) ([]DownloadDuplicate, error) {
	if len(inputs) == 0 || len(inputs) > 200 {
		return nil, fmt.Errorf("%w: provide between 1 and 200 tasks", ErrInvalidTaskInput)
	}
	keys := make([]string, len(inputs))
	for i, input := range inputs {
		options, err := mediaTaskOptions(input)
		if err != nil {
			return nil, err
		}
		keys[i] = duplicateIdentity(input.URL, options)
	}
	candidates, err := s.repo.DuplicateCandidates()
	if err != nil {
		return nil, err
	}
	matches := map[string]DownloadDuplicate{}
	for _, item := range candidates {
		key := duplicateIdentity(item.URL, item.Options)
		if _, exists := matches[key]; !exists && key != "" {
			matches[key] = DownloadDuplicate{ID: item.ID, Name: item.Name, Status: item.Status}
		}
	}
	result := []DownloadDuplicate{}
	for i, key := range keys {
		if match, exists := matches[key]; exists {
			match.Index = i
			result = append(result, match)
		}
	}
	return result, nil
}
