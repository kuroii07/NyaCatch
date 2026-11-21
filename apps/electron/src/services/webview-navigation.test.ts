import assert from "node:assert/strict";
import test from "node:test";
import {
  preventExternalWebviewNavigation,
  webviewNavigationAllowed,
} from "./webview-navigation";

test("material pages block OS protocols in both current and legacy navigation event shapes", () => {
  for (const target of [
    "bytedance://dispatch",
    "BYTEDANCE://dispatch",
    "snssdk1128://detail/123",
    "intent://video#Intent;scheme=bytedance;end",
    "kwai://home",
    "file:///C:/Windows",
    "ms-windows-store://home",
    "javascript:alert(1)",
    "mailto:test@example.com",
    "invalid",
    "",
    undefined,
  ]) {
    assert.equal(webviewNavigationAllowed(target), false, target);
    for (const legacy of [false, true]) {
      let blocked = false;
      preventExternalWebviewNavigation(
        {
          url: legacy ? undefined : target,
          preventDefault() {
            blocked = true;
          },
        },
        legacy ? target : undefined,
      );
      assert.equal(blocked, true, String(target));
    }
  }
});

test("normal links, same-page navigation and browser-owned documents remain in Chromium", () => {
  for (const target of [
    "https://www.douyin.com/jingxuan",
    "https://www.kuaishou.com/new-reco",
    "http://127.0.0.1:40709/page?a=1#keep",
    "https://example.com/?target=bytedance%3A%2F%2Fapp",
    "about:blank",
    "about:srcdoc",
    "blob:https://example.com/123",
    "data:text/html,<p>browser document</p>",
  ]) {
    assert.equal(webviewNavigationAllowed(target), true);
    preventExternalWebviewNavigation({
      url: target,
      preventDefault() {
        assert.fail(target);
      },
    });
  }
  assert.equal(webviewNavigationAllowed("about:settings"), false);
});
