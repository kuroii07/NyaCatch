import test from "node:test";
import assert from "node:assert/strict";
import {
  postNavigationAllowed,
  preventExternalPostNavigation,
} from "./post-browser-navigation";

test("anonymous metadata pages cannot invoke OS app protocols in any frame or redirect", () => {
  for (const platform of ["douyin", "xiaohongshu"] as const) {
    for (const url of [
      "bytedance://dispatch?test=1",
      "snssdk1128://aweme/detail/123",
      "intent://video#Intent;scheme=bytedance;end",
      "file:///C:/Windows",
      "javascript:alert(1)",
      "https://www.douyin.com.evil.test/",
      "https://user:pass@www.douyin.com/video/123",
      "https://www.douyin.com:444/video/123",
    ]) {
      let prevented = false;
      preventExternalPostNavigation(
        {
          url,
          preventDefault() {
            prevented = true;
          },
        },
        platform,
      );
      assert.equal(prevented, true, url);
    }
  }
});

test("normal HTTPS platform navigation stays available without opening external apps", () => {
  for (const url of [
    "https://v.douyin.com/example/",
    "https://www.douyin.com/video/7700577998572354746",
    "https://www.iesdouyin.com/share/video/7700577998572354746/",
  ])
    assert.equal(postNavigationAllowed(url, "douyin"), true);
  for (const url of [
    "https://xhslink.cn/o/Abc12345",
    "https://xhslink.com/a/Abc12345",
    "https://www.xiaohongshu.com/explore/123456789012345678901234",
  ])
    assert.equal(postNavigationAllowed(url, "xiaohongshu"), true);
  assert.equal(
    postNavigationAllowed("https://www.xiaohongshu.com/", "douyin"),
    false,
  );
});
