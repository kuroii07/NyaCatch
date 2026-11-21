package core

import "testing"

func TestDouyinImageOptions(t *testing.T) {
	source := "https://www.douyin.com/note/7700577998572354746"
	options := MediaOptions{Version: 1, Mode: "image", Resolver: "douyin-browser", ResourceID: "dyimg-7700577998572354746-stable"}
	if err := options.ValidateSource(source); err != nil {
		t.Fatal(err)
	}
	options.FormatID = "douyin-browser-best"
	if options.Validate() == nil {
		t.Fatal("video format accepted for image")
	}
	options.FormatID = ""
	options.ResourceID = ""
	if options.Validate() == nil {
		t.Fatal("image without exact identity accepted")
	}
}
