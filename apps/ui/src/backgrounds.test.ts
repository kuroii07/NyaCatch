import assert from "node:assert/strict";
import { test } from "node:test";
import {
  backgroundPresetIds,
  defaultBackground,
  normalizeBackground,
} from "./backgrounds";
import { migrateAppearance } from "./themes";
import { backgroundMessages } from "./i18n/backgrounds";

const customImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const expectedDefault = {
  source: "none",
  opacity: 20,
  blur: 8,
  customImage: "",
};

test("missing and non-object background preferences use independent defaults", () => {
  assert.deepEqual(defaultBackground, expectedDefault);
  for (const value of [undefined, null, false, 0, "night", [], {}]) {
    const normalized = normalizeBackground(value);
    assert.deepEqual(normalized, expectedDefault);
    assert.notStrictEqual(normalized, defaultBackground);
  }
  const normalized = normalizeBackground(undefined);
  normalized.opacity = 90;
  assert.deepEqual(normalizeBackground(undefined), expectedDefault);
  assert.deepEqual(defaultBackground, expectedDefault);
});

test("legacy appearance migration keeps theme, sidebar and old colors", () => {
  for (const [accent, themeId] of [
    ["yellow", "cream"],
    ["blue", "sky"],
    ["rose", "sakura"],
  ]) {
    assert.deepEqual(
      migrateAppearance({ accent, progress: "teal", sidebarExpanded: true }),
      {
        themeId,
        sidebarExpanded: true,
        legacyColors: { accent, progress: "teal" },
        background: expectedDefault,
      },
    );
  }
  const background = { source: "custom", opacity: 42, blur: 11, customImage };
  const migrated = migrateAppearance({
    themeId: "sunset",
    accent: "blue",
    progress: "teal",
    sidebarExpanded: true,
    background,
  });
  assert.equal(migrated.themeId, "sunset");
  assert.equal(migrated.sidebarExpanded, true);
  assert.deepEqual(migrated.legacyColors, { accent: "blue", progress: "teal" });
  assert.deepEqual(migrated.background, background);
});

test("all four built-in background presets survive normalization", () => {
  assert.deepEqual(backgroundPresetIds, ["meadow", "cloud", "lake", "night"]);
  for (const source of ["meadow", "cloud", "lake", "night"]) {
    assert.deepEqual(normalizeBackground({ source, opacity: 38, blur: 12 }), {
      source,
      opacity: 38,
      blur: 12,
      customImage: "",
    });
  }
});

test("unknown sources and custom sources without an image fall back to none", () => {
  for (const source of ["custom", "unknown", "toString", "NIGHT", 1, null]) {
    assert.deepEqual(normalizeBackground({ source }), expectedDefault);
  }
});

test("external URLs, SVG and malformed data cannot become custom backgrounds", () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString(
    "base64",
  );
  for (const invalidImage of [
    "https://example.com/background.png",
    "http://example.com/background.svg",
    "//example.com/background.webp",
    "file:///C:/background.png",
    "blob:https://example.com/background",
    "javascript:alert(1)",
    `<svg xmlns="http://www.w3.org/2000/svg"/>`,
    `data:image/svg+xml;base64,${svg}`,
    "data:image/svg+xml,%3Csvg%2F%3E",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/png;base64,",
    "data:image/png;base64,AA A=",
    "data:image/png;base64,AAAA===",
    "data:image/png;base64,AAAA!",
    12,
    {},
    null,
  ]) {
    assert.deepEqual(
      normalizeBackground({ source: "custom", customImage: invalidImage }),
      expectedDefault,
    );
    assert.deepEqual(
      normalizeBackground({ source: "lake", customImage: invalidImage }),
      { ...expectedDefault, source: "lake" },
    );
  }
});

test("valid raster data URLs are retained without changing their contents", () => {
  for (const image of [
    customImage,
    "data:image/jpeg;base64,AAAA",
    "data:image/webp;base64,AAAA",
  ]) {
    assert.deepEqual(
      normalizeBackground({ source: "custom", customImage: image }),
      { ...expectedDefault, source: "custom", customImage: image },
    );
  }
});

test("stored data URL size limit accepts the boundary and rejects oversize data", () => {
  const prefix = "data:image/png;base64,";
  const boundaryImage = prefix + "A".repeat(1_500_000 - prefix.length);
  assert.equal(
    normalizeBackground({ source: "custom", customImage: boundaryImage })
      .customImage,
    boundaryImage,
  );
  assert.deepEqual(
    normalizeBackground({ source: "custom", customImage: boundaryImage + "A" }),
    expectedDefault,
  );
});

test("opacity and blur clamp finite ranges and round fractional values", () => {
  for (const [opacity, blur, expectedOpacity, expectedBlur] of [
    [-1, -1, 0, 0],
    [0, 0, 0, 0],
    [100, 30, 100, 30],
    [999, 999, 100, 30],
    [41.6, 12.4, 42, 12],
    [99.9, 29.9, 100, 30],
  ]) {
    assert.deepEqual(normalizeBackground({ opacity, blur }), {
      ...expectedDefault,
      opacity: expectedOpacity,
      blur: expectedBlur,
    });
  }
});

test("non-numeric and non-finite effects fall back independently", () => {
  for (const invalid of [
    undefined,
    null,
    "50",
    "",
    true,
    false,
    [],
    {},
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.deepEqual(normalizeBackground({ opacity: invalid, blur: 14 }), {
      ...expectedDefault,
      blur: 14,
    });
    assert.deepEqual(normalizeBackground({ opacity: 45, blur: invalid }), {
      ...expectedDefault,
      opacity: 45,
    });
  }
});

test("switching presets or disabling background retains the custom image", () => {
  const original = normalizeBackground({
    source: "custom",
    opacity: 47,
    blur: 13,
    customImage,
  });
  for (const source of ["meadow", "cloud", "lake", "night", "none"]) {
    const switched = normalizeBackground({ ...original, source });
    assert.deepEqual(switched, { ...original, source });
    assert.deepEqual(
      normalizeBackground({ ...switched, source: "custom" }),
      original,
    );
  }
  assert.deepEqual(original, {
    source: "custom",
    opacity: 47,
    blur: 13,
    customImage,
  });
});

test("background messages have matching non-empty keys in all five languages", () => {
  assert.deepEqual(Object.keys(backgroundMessages), [
    "zh",
    "zh-TW",
    "en",
    "ja",
    "ko",
  ]);
  const expectedKeys = Object.keys(backgroundMessages.en).sort();
  assert.equal(expectedKeys.length, 17);
  for (const messages of Object.values(backgroundMessages)) {
    assert.deepEqual(Object.keys(messages).sort(), expectedKeys);
    for (const message of Object.values(messages)) assert.ok(message.trim());
    for (const key of [
      "backgroundUploadHint",
      "backgroundUploadError",
    ] as const) {
      for (const token of ["JPG", "PNG", "WebP", "GIF", "10 MB"]) {
        assert.ok(messages[key].includes(token), `${key}: ${token}`);
      }
    }
  }
});
