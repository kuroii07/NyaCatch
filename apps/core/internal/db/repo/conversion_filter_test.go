package repo

import (
	"caorushizi.cn/mediago/internal/core"
	"path/filepath"
	"testing"

	"caorushizi.cn/mediago/internal/db"
)

func TestConversionFilterKeepsLegacyAndPaginatesPerKind(t *testing.T) {
	database, err := db.New(filepath.Join(t.TempDir(), "conversions.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	r := NewConversionRepository(database)
	for _, format := range []string{"mp4", "mkv", "MP3", "wav", "png", "jpg", "legacy", "original"} {
		if _, err := r.Create(&db.Conversion{Path: "fixture", OutputFormat: format, Quality: "medium", Status: "pending"}); err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct {
		kind  string
		total int64
	}{{"", 8}, {"video", 3}, {"audio", 3}, {"image", 2}} {
		page, err := r.FindWithPagination(1, 1, tc.kind)
		if err != nil {
			t.Fatal(err)
		}
		if page.Total != tc.total || len(page.Items) != 1 {
			t.Fatalf("%s: total=%d rows=%d", tc.kind, page.Total, len(page.Items))
		}
	}
	if _, err := r.FindWithPagination(1, 10, "unknown"); err == nil {
		t.Fatal("unknown category accepted")
	}
}

func TestTrimFilterSeparatesConversionKindsBeforePagination(t *testing.T) {
	database, err := db.New(filepath.Join(t.TempDir(), "trim.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	r := NewConversionRepository(database)
	plain := &core.ConversionOptions{Version: 1}
	trim := &core.ConversionOptions{Version: 1, Trim: &core.TrimRange{EndMs: 1000}}
	merge := &core.ConversionOptions{Version: 1, Merge: &core.MergeSources{Paths: []string{"a", "b"}, Name: "merged"}}
	capture := &core.ConversionOptions{Version: 1, Capture: &core.CaptureRange{StartMs: 1000}}
	compress := &core.ConversionOptions{Version: 1, Compress: &core.CompressionOptions{Codec: "h264"}}
	mux := &core.ConversionOptions{Version: 1, Mux: &core.MuxOptions{}}
	var ids []int64
	for _, fixture := range []struct {
		format  string
		status  string
		options *core.ConversionOptions
	}{
		{"mp4", "pending", nil},
		{"mp4", "converting", trim},
		{"wav", "pending", plain},
		{"wav", "done", trim},
		{"png", "done", plain},
		{"legacy", "failed", nil},
		{"mkv", "failed", trim},
		{"MP3", "done", nil},
		{"JPG", "pending", nil},
		{"mp4", "done", merge},
		{"wav", "pending", merge},
		{"png", "done", capture},
		{"gif", "pending", capture},
		{"mp4", "done", compress},
		{"mkv", "pending", compress},
		{"mp4", "pending", mux},
		{"mkv", "done", mux},
	} {
		row, err := r.Create(&db.Conversion{Path: "fixture", OutputFormat: fixture.format, Quality: "medium", Status: fixture.status, Options: fixture.options})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, row.ID)
	}
	for _, tc := range []struct {
		kind    string
		indices []int
	}{
		{"", []int{16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0}},
		{"video", []int{5, 0}},
		{"audio", []int{7, 2}},
		{"image", []int{8, 4}},
		{"trim", []int{6, 3, 1}},
		{"merge", []int{10, 9}},
		{"capture", []int{12, 11}},
		{"compress", []int{14, 13}},
		{"mux", []int{16, 15}},
	} {
		t.Run(tc.kind, func(t *testing.T) {
			for page := 1; page <= len(tc.indices)+1; page++ {
				result, err := r.FindWithPagination(page, 1, tc.kind)
				if err != nil {
					t.Fatal(err)
				}
				if result.Total != int64(len(tc.indices)) {
					t.Fatalf("total=%d, want %d", result.Total, len(tc.indices))
				}
				if page > len(tc.indices) {
					if len(result.Items) != 0 {
						t.Fatal("last page should be empty")
					}
				} else if len(result.Items) != 1 || result.Items[0].ID != ids[tc.indices[page-1]] {
					t.Fatalf("page %d contains another task kind: %+v", page, result.Items)
				}
			}
		})
	}
	if err := r.UpdateStatus(ids[1], "done", 100, "clip.mp4", nil); err != nil {
		t.Fatal(err)
	}
	result, err := r.FindWithPagination(1, 50, "trim")
	if err != nil || result.Total != 3 {
		t.Fatalf("finished clip changed task kind: %+v %v", result, err)
	}
}
