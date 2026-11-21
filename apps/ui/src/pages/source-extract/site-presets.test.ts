import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { presetForURL, presetName, sitePresets } from "./site-presets";
import { sourceHomeMessages } from "../../i18n/source-home";

test("built-in shortcuts have unique public destinations and preserve real site identity", () => {
  assert.equal(sitePresets.length, 20);
  assert.equal(new Set(sitePresets.map((site) => site.id)).size, 20);
  for (const region of ["domestic", "international"])
    assert.equal(
      sitePresets.filter((site) => site.region === region).length,
      10,
    );
  for (const site of sitePresets) {
    assert.equal(new URL(site.url).protocol, "https:");
    assert.equal(presetForURL(site.url)?.id, site.id);
    for (const locale of ["zh", "zh-TW", "en", "ja", "ko"])
      assert.ok(presetName(site, locale));
  }
  assert.equal(
    presetForURL("https://space.bilibili.com/32708543")?.id,
    "bilibili",
  );
  assert.equal(presetForURL("https://twitter.com/example")?.id, "x");
  for (const value of [
    "https://bilibili.com.evil.example/",
    "https://user:secret@bilibili.com/",
    "file:///bilibili.com",
    "invalid",
  ])
    assert.equal(presetForURL(value), undefined);
});
test("every preset bundles a verified website favicon instead of a generated icon", () => {
  const directory = new URL("../../assets/site-icons/", import.meta.url);
  const manifest = JSON.parse(
    readFileSync(new URL("sources.json", directory), "utf8"),
  ) as {
    icons: {
      id: string;
      file: string;
      source: string;
      sha256: string;
      bytes: number;
    }[];
  };
  assert.equal(manifest.icons.length, 20);
  for (const site of sitePresets) {
    const icon = manifest.icons.find((candidate) => candidate.id === site.id);
    assert.ok(icon);
    assert.equal(new URL(icon.source).protocol, "https:");
    const bytes = readFileSync(new URL(icon.file, directory));
    assert.equal(bytes.length, icon.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), icon.sha256);
    assert.ok(
      bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])) ||
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    );
  }
});
test("home groups and drawer controls have complete five-language labels", () => {
  const keys = Object.keys(sourceHomeMessages.zh).sort();
  for (const messages of Object.values(sourceHomeMessages)) {
    assert.deepEqual(Object.keys(messages).sort(), keys);
    assert.ok(Object.values(messages).every((text) => text.trim()));
  }
});
