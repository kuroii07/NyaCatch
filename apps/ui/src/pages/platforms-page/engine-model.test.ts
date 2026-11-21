import assert from "node:assert/strict";
import test from "node:test";
import generated from "./engine-catalog.generated.json";
import { engineCatalogTranslations } from "../../i18n/engine-catalog";
import {
  filterEngineCatalog,
  paginateEngineCatalog,
  parseExtractorList,
} from "./engine-model";

test("extractor catalog retains all variants and broken status while removing duplicate names", () => {
  const result = parseExtractorList(
    "\uFEFFyoutube\r\nyoutube:tab\r\ngeneric\r\ngeneric\r\nSite (CURRENTLY BROKEN)\r\nSite\r\n",
  );
  assert.deepEqual(result, [
    { id: "youtube", broken: false },
    { id: "youtube:tab", broken: false },
    { id: "generic", broken: false },
    { id: "Site", broken: true },
  ]);
  for (const data of ["", " \n", "bad\u0000name", " (CURRENTLY BROKEN)"])
    assert.throws(() => parseExtractorList(data));
});

test("full engine search resolves known Chinese aliases without restricting the remaining engines", () => {
  const entries = parseExtractorList(
    "BiliBili\nDouyin\nXiaoHongShu\ntwitter\nvimeo\nsoundcloud\nyoutube:tab\nobsolete (CURRENTLY BROKEN)",
  );
  for (const [query, expected] of [
    ["B站", "BiliBili"],
    ["抖音", "Douyin"],
    ["小红书", "XiaoHongShu"],
    ["X", "twitter"],
    ["推特", "twitter"],
    [" Vimeo ", "vimeo"],
    ["SoundCloud", "soundcloud"],
  ]) {
    assert.equal(filterEngineCatalog(entries, query, "all")[0]?.id, expected);
  }
  assert.deepEqual(filterEngineCatalog(entries, "", "broken"), [
    { id: "obsolete", broken: true },
  ]);
  assert.equal(filterEngineCatalog(entries, "", "available").length, 7);
  assert.deepEqual(filterEngineCatalog(entries, "not-present", "all"), []);
});

test("new popular-site aliases search actual extractor names without losing Tencent Video", () => {
  for (const query of ["腾讯视频", "騰訊視頻", "tencent", "qqvideo"])
    assert.ok(
      filterEngineCatalog(generated.extractors, query, "all").every((entry) =>
        entry.id.startsWith("vqq:"),
      ),
    );
  assert.ok(
    filterEngineCatalog(generated.extractors, "腾讯视频", "all").length > 0,
  );
  assert.ok(
    filterEngineCatalog(generated.extractors, "网易云音乐", "all").length > 0,
  );
  assert.ok(
    filterEngineCatalog(generated.extractors, "声云", "all").length > 0,
  );
});

test("engine pagination clamps after a filter and never drops or duplicates entries", () => {
  const entries = Array.from({ length: 1754 }, (_, i) => i);
  const combined = [];
  for (let page = 1; page <= 37; page++)
    combined.push(...paginateEngineCatalog(entries, page).entries);
  assert.deepEqual(combined, entries);
  assert.equal(paginateEngineCatalog([1], 999).current, 1);
  assert.deepEqual(paginateEngineCatalog([], 1), {
    pages: 1,
    current: 1,
    entries: [],
  });
});

test("generated full catalog includes platforms beyond the initial four and retains tool provenance", () => {
  assert.ok(generated.extractors.length > 1000);
  assert.ok(generated.rawEntryCount >= generated.extractors.length);
  assert.match(generated.binarySha256, /^[a-f\d]{64}$/);
  assert.match(generated.version, /^\d{4}\.\d{2}\.\d{2}$/);
  assert.equal(
    new Set(generated.extractors.map((entry) => entry.id)).size,
    generated.extractors.length,
  );
  for (const id of ["vimeo", "soundcloud", "Douyin", "XiaoHongShu", "generic"])
    assert.ok(
      generated.extractors.some((entry) => entry.id === id),
      id,
    );
  assert.ok(generated.extractors.some((entry) => entry.broken));
});

test("full catalog user messages exist in all five application languages", () => {
  for (const values of Object.values(engineCatalogTranslations)) {
    assert.deepEqual(
      Object.keys(values).toSorted(),
      Object.keys(engineCatalogTranslations.en).toSorted(),
    );
    assert.ok(Object.values(values).every((value) => value.length > 0));
  }
});
