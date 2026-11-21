package postmedia

import "testing"

func TestXhsSource(t *testing.T) {
	valid := "https://www.xiaohongshu.com/discovery/item/6ae09439000000001f01697b?xsec_token=x"
	if _, err := XhsID(valid); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"http://www.xiaohongshu.com/explore/6ae09439000000001f01697b", "https://www.xiaohongshu.com.evil.test/explore/6ae09439000000001f01697b", "https://www.xiaohongshu.com/explore/6ae09439000000001f01697b/extra"} {
		if _, err := XhsID(bad); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
}

func TestXhsShortSource(t *testing.T) {
	for _, source := range []string{"http://xhslink.com/a/Abc123XYZ", "https://xhslink.cn/o/Abc123XYZ", "https://xhslink.com/Abc123XYZ"} {
		id, err := XhsID(source)
		if err != nil || id != "" {
			t.Fatal("known short link rejected")
		}
	}
	for _, source := range []string{"https://xhslink.com.evil.test/a/Abc123XYZ", "https://user:pass@xhslink.com/a/Abc123XYZ", "https://xhslink.com:444/a/Abc123XYZ", "https://xhslink.com/a/Abc123XYZ/extra"} {
		if _, err := XhsID(source); err == nil {
			t.Fatal("untrusted short link accepted")
		}
	}
}

func TestXhsImageSource(t *testing.T) {
	if !XhsCDNURL("https://sns-webpic-qc.xhscdn.com/file?variant=webp") {
		t.Fatal("known image source rejected")
	}
	for _, bad := range []string{"http://sns-webpic-qc.xhscdn.com/file", "https://sns-webpic-qc.xhscdn.com.evil.test/file", "https://u:p@sns-webpic-qc.xhscdn.com/file", "https://sns-webpic-qc.xhscdn.com:444/file"} {
		if XhsCDNURL(bad) {
			t.Fatalf("accepted %s", bad)
		}
	}
}
