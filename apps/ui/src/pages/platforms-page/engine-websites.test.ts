import assert from "node:assert/strict";
import test from "node:test";
import generated from "./engine-catalog.generated.json";
import {
  extractorWebsite,
  extractorWebsites,
  safeWebsiteURL,
  websiteUnavailableReason,
  websiteCatalogVersion,
} from "./engine-websites";
import websites from "./engine-websites.generated.json";

test("official navigation resolves reviewed sites, variants and exact aliases", () => {
  for (const [id, url] of [
    ["BiliBili", "https://www.bilibili.com/"],
    ["BilibiliCollectionList", "https://www.bilibili.com/"],
    ["bilibili category extractor", "https://www.bilibili.com/"],
    ["youtube:playlist", "https://www.youtube.com/"],
    ["YoutubeYtBe", "https://www.youtube.com/"],
    ["twitter:spaces", "https://x.com/"],
    ["instagram:user", "https://www.instagram.com/"],
    ["vqq:series", "https://v.qq.com/"],
    ["netease:album", "https://music.163.com/"],
    ["SoundcloudEmbed", "https://soundcloud.com/"],
    ["PinterestCollection", "https://www.pinterest.com/"],
  ])
    assert.equal(extractorWebsite(id), url, id);
  const mapped = generated.extractors.filter(
    (entry) => extractorWebsites(entry.id).length,
  );
  assert.ok(
    mapped.length >= 1700,
    "full catalog must not regress to a small curated site list",
  );
  assert.ok(
    mapped.some((entry) => entry.broken),
    "engine status does not block website navigation",
  );
  for (const entry of mapped) {
    for (const url of extractorWebsites(entry.id))
      assert.equal(safeWebsiteURL(url), url);
  }
});

test("unknown, generic, regional and unrelated extractor names never guess URLs", () => {
  for (const id of [
    "generic",
    "youtube-unknown",
    "twitterfake",
    "https://example.com/",
    "__proto__",
    "constructor",
    "",
  ])
    assert.equal(extractorWebsite(id), undefined, id);
});

test("navigation addresses allow only credential-free HTTPS without query or fragment", () => {
  assert.equal(
    safeWebsiteURL("https://www.youtube.com/"),
    "https://www.youtube.com/",
  );
  for (const value of [
    "bad url",
    "http://example.com",
    "javascript:alert(1)",
    "file:///C:/test",
    "https://user:password@example.com/",
    "https://example.com:8443/",
    "https://localhost/",
    "https://example.com/?token=secret",
    "https://example.com/#target",
    "https://127.0.0.1/",
    "https://example.com/",
    "https://name.invalid/",
    "https://host.local/",
  ])
    assert.equal(safeWebsiteURL(value), undefined);
});

test("official source provenance matches every exact bundled rule and the engine version", () => {
  assert.equal(websiteCatalogVersion, generated.version);
  assert.equal(websites.source.version, generated.version);
  assert.match(websites.source.sha256, /^[a-f\d]{64}$/);
  assert.ok(websites.source.url.startsWith("https://files.pythonhosted.org/"));
  const ids = [
    ...Object.keys(websites.rules),
    ...Object.keys(websites.unavailable),
  ];
  assert.equal(new Set(ids).size, generated.extractors.length);
  assert.deepEqual(
    [...ids].sort(),
    generated.extractors.map((entry) => entry.id).sort(),
  );
  const rules: Record<string, { url: string; source: string }[]> =
    websites.rules;
  for (const options of Object.values(rules)) {
    assert.ok(options.length);
    for (const option of options) {
      assert.equal(safeWebsiteURL(option.url), option.url);
      assert.match(option.source, /^yt_dlp\/extractor\/[\w/]+\.py$/);
    }
  }
});

test("regional services keep their own sites and multi-brand rules keep explicit choices", () => {
  assert.ok(extractorWebsites("BiliIntl").includes("https://www.bilibili.tv/"));
  assert.ok(
    !extractorWebsites("BiliIntl").includes("https://www.bilibili.com/"),
  );
  assert.equal(extractorWebsite("iq.com"), "https://www.iq.com/");
  assert.ok(extractorWebsites("qqmusic").includes("https://y.qq.com/"));
  assert.ok(
    extractorWebsites("web.archive:youtube").includes(
      "https://web.archive.org/",
    ),
  );
  for (const [id, expected] of [
    ["17live", "https://17.live/"],
    ["3sat", "https://www.3sat.de/"],
    ["AcFunVideo", "https://www.acfun.cn/"],
  ])
    assert.equal(extractorWebsite(id), expected);
  assert.ok(extractorWebsites("10play").includes("https://10.com.au/"));
  assert.ok(
    extractorWebsites("aenetworks").includes("https://www.history.com/"),
  );
  assert.ok(extractorWebsites("aenetworks").includes("https://www.aetv.com/"));
  assert.equal(
    extractorWebsite("aenetworks"),
    undefined,
    "never choose a random brand for a multi-site rule",
  );
  assert.equal(websiteUnavailableReason("generic"), "pcWebsiteNone");
  assert.equal(websiteUnavailableReason("html5"), "pcWebsiteNone");
  assert.equal(websiteUnavailableReason("AdobeConnect"), "pcWebsiteMissing");
});
