import assert from "node:assert/strict";
import test from "node:test";
import {
  filterPlatforms,
  findPlatform,
  PLATFORM_CATALOG,
  platformDetailKeys,
} from "./platforms";
import catalog from "./engine-catalog.generated.json";
import iconSources from "../../assets/site-icons/sources.json";
import { sitePresets } from "../source-extract/site-presets";
import { platformTranslations } from "../../i18n/platforms";
import { BATCH_EVIDENCE } from "./batch-evidence";

test("batch evidence separates recent parse counts from complete downloads", () => {
  assert.equal(BATCH_EVIDENCE.length, 13);
  assert.equal(
    BATCH_EVIDENCE.reduce((sum, x) => sum + x.total, 0),
    31,
  );
  assert.equal(
    BATCH_EVIDENCE.reduce((sum, x) => sum + x.parsed, 0),
    23,
  );
  assert.deepEqual(
    BATCH_EVIDENCE.filter((x) => x.downloadTested).map((x) => x.id),
    ["douyin", "xiaohongshu"],
  );
  assert.equal(BATCH_EVIDENCE.find((x) => x.id === "xiaohongshu")?.parsed, 0);
  assert.deepEqual(findPlatform("xiaohongshu")?.media, [
    "video",
    "audio",
    "image",
    "cover",
  ]);
});

test("catalog keeps sample-tested mainstream platforms first", () => {
  assert.deepEqual(
    PLATFORM_CATALOG.slice(0, 4).map((platform) => platform.id),
    ["bilibili", "youtube", "x", "instagram"],
  );
  assert.equal(
    PLATFORM_CATALOG.slice(0, 4).every(
      (platform) => platform.status !== "planned",
    ),
    true,
  );
});

test("navigation only resolves catalog IDs and evidence stays explicit", () => {
  assert.equal(findPlatform("youtube")?.website, "https://www.youtube.com/");
  for (const value of [null, "https://evil.example/", "__proto__", "unknown"]) {
    assert.equal(findPlatform(value), undefined);
  }
  assert.equal(findPlatform("x")?.status, "partial");
  for (const platform of PLATFORM_CATALOG) {
    assert.equal(new URL(platform.website).protocol, "https:");
    assert.equal(
      !!platform.verifiedAt,
      ["verified", "partial"].includes(platform.status),
    );
    const details = platformDetailKeys(platform);
    for (const locale of Object.values(platformTranslations)) {
      for (const key of [platform.nameKey, details.evidence, details.limit]) {
        assert.ok(
          (locale as Record<string, string>)[key],
          `${platform.id}: ${key}`,
        );
      }
      assert.deepEqual(
        Object.keys(locale).toSorted(),
        Object.keys(platformTranslations.en).toSorted(),
      );
    }
  }
});

test("popular sites expand to 18 while engine-listed additions remain untested", () => {
  assert.equal(PLATFORM_CATALOG.length, 18);
  assert.equal(new Set(PLATFORM_CATALOG.map((site) => site.id)).size, 18);
  assert.equal(
    PLATFORM_CATALOG.filter((site) => site.region === "domestic").length,
    9,
  );
  const additions = PLATFORM_CATALOG.slice(6);
  assert.equal(additions.length, 12);
  for (const site of additions) {
    assert.equal(site.status, "engine");
    assert.equal(site.verifiedAt, undefined);
    assert.equal(
      site.website,
      sitePresets.find((preset) => preset.id === site.id)?.url,
    );
    assert.ok(iconSources.icons.some((icon) => icon.id === site.id));
    const prefix = site.extractorPrefix || site.id;
    assert.ok(
      catalog.extractors.some(
        (entry) =>
          !entry.broken &&
          (entry.id.toLowerCase().startsWith(prefix + ":") ||
            entry.id.toLowerCase() === prefix),
      ),
    );
  }
  assert.equal(
    filterPlatforms(PLATFORM_CATALOG, {
      query: "",
      region: "all",
      media: "all",
      status: "engine",
    }).length,
    12,
  );
  for (const site of PLATFORM_CATALOG.filter(
    (platform) => platform.id === "netease" || platform.id === "soundcloud",
  ))
    assert.equal(site.media.includes("video"), false);
});

test("filters by region, media type, status, and search", () => {
  assert.deepEqual(
    filterPlatforms(PLATFORM_CATALOG, {
      region: "domestic",
      media: "video",
      status: "partial",
      query: "",
    }).map((platform) => platform.id),
    ["bilibili", "douyin", "xiaohongshu"],
  );
  assert.deepEqual(
    filterPlatforms(PLATFORM_CATALOG, {
      region: "all",
      media: "image",
      status: "verified",
      query: "instagram",
    }).map((platform) => platform.id),
    ["instagram"],
  );
  assert.deepEqual(
    filterPlatforms(PLATFORM_CATALOG, {
      region: "domestic",
      media: "cover",
      status: "partial",
      query: "B站",
    }).map((platform) => platform.id),
    ["bilibili"],
  );
  assert.deepEqual(
    filterPlatforms(PLATFORM_CATALOG, {
      region: "all",
      media: "all",
      status: "all",
      query: "不存在的平台",
    }),
    [],
  );
});
