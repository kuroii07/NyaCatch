import assert from "node:assert/strict";
import test from "node:test";
import { desktopBrowserUserAgent } from "./browser-user-agent";

test("desktop UA retains native OS and actual Chromium version without application product tags", () => {
  for (const platform of [
    "Windows NT 10.0; Win64; x64",
    "Macintosh; Intel Mac OS X 10_15_7",
    "X11; Linux x86_64",
  ]) {
    const prefix = `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko)`;
    const native = `${prefix} mediago-community/0.1.0 Chrome/145.0.0.0 Electron/41.1.0 Safari/537.36`;
    assert.equal(
      desktopBrowserUserAgent(native, "146.0.7680.164"),
      `${prefix} Chrome/146.0.0.0 Safari/537.36`,
    );
    assert.equal(
      desktopBrowserUserAgent(
        `${prefix} Chrome/146.0.0.0 Safari/537.36`,
        "147.0.1.2",
      ),
      `${prefix} Chrome/147.0.0.0 Safari/537.36`,
    );
  }
});

test("missing runtime information cannot silently produce an empty or invented desktop identity", () => {
  for (const [agent, version] of [
    ["", "146.0.0.0"],
    ["invalid", "146.0.0.0"],
    [
      "Mozilla/5.0 (Windows) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36",
      "",
    ],
    [
      "Mozilla/5.0 (Windows) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36",
      "not-a-version",
    ],
  ])
    assert.throws(() => desktopBrowserUserAgent(agent, version));
});
