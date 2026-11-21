package postmedia

import "testing"

func TestDouyinSource(t *testing.T) {
	for _, valid := range []string{"https://v.douyin.com/ECM9CkNPp-E/", "https://www.douyin.com/video/7700577998572354746", "https://www.douyin.com/note/7700577998572354746"} {
		if err := ValidateDouyinSource(valid); err != nil {
			t.Fatal(err)
		}
	}
	for _, bad := range []string{"http://v.douyin.com/ECM9CkNPp-E/", "https://v.douyin.com.evil.test/ECM9CkNPp-E/", "https://www.douyin.com/note/7700577998572354746/extra", "https://www.douyin.com/video/7700577998572354746/extra"} {
		if ValidateDouyinSource(bad) == nil {
			t.Fatalf("unexpected source accepted: %s", bad)
		}
	}
}

func TestDouyinImageSource(t *testing.T) {
	for _, source := range []string{"https://p3-sign.douyinpic.com/tos-cn-i-test/image", "https://p9-pc-sign.douyinpic.com/image?signature=test"} {
		if !DouyinCDNURL(source) {
			t.Fatal("image CDN rejected")
		}
	}
	for _, source := range []string{"http://p3-sign.douyinpic.com/image", "https://p3-sign.douyinpic.com.evil.test/image", "https://user:pass@p3-sign.douyinpic.com/image", "https://p3-sign.douyinpic.com:444/image", "https://www.douyin.com/image"} {
		if DouyinCDNURL(source) {
			t.Fatal("untrusted image CDN accepted")
		}
	}
}
