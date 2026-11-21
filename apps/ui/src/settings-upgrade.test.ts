import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getThemeTokens,
  getThemeCss,
  migrateAppearance,
  themePresets,
} from "./themes";
import { resolveAppLanguage } from "../../../packages/shared/common/src/i18n/config";
import { i18nResources } from "../../../packages/shared/common/src/i18n/resources";
import { workbenchTranslations } from "./i18n/workbench";
import { downloadTranslations } from "./i18n/downloads";
import { settingsTranslations } from "./i18n/settings";
import { zhTWUi } from "./i18n/locales/zh-TW";
import { jaUi } from "./i18n/locales/ja";
import { koUi } from "./i18n/locales/ko";
import { isValidServiceUrl } from "./pages/setting-page/settings-controls";

test("system language recognizes script and region aliases; saved language wins", () => {
  for (const [locale, expected] of [
    ["zh-CN", "zh"],
    ["zh-Hans", "zh"],
    ["zh-TW", "zh-TW"],
    ["zh-Hant", "zh-TW"],
    ["zh_HK", "zh-TW"],
    ["zh-MO", "zh-TW"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["fr-FR", "en"],
  ])
    assert.equal(resolveAppLanguage("system", locale), expected);
  assert.equal(resolveAppLanguage("en", "ja-JP"), "en");
  assert.equal(resolveAppLanguage("zh", "zh-TW"), "zh");
});

test("legacy color preferences preserve sidebar and map to complete themes", () => {
  for (const [accent, themeId] of [
    ["yellow", "cream"],
    ["blue", "sky"],
    ["rose", "sakura"],
  ]) {
    const migrated = migrateAppearance({
      accent,
      progress: "teal",
      sidebarExpanded: true,
    });
    assert.equal(migrated.themeId, themeId);
    assert.equal(migrated.sidebarExpanded, true);
    assert.equal(migrated.legacyColors.progress, "teal");
  }
  assert.equal(migrateAppearance({ themeId: "unknown" }).themeId, "cream");
  assert.equal(migrateAppearance({ themeId: "sunset" }).themeId, "sunset");
});

function luminance(hex: string) {
  const rgb = (hex.slice(1).match(/../g) ?? [])
    .map((part) => parseInt(part, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb.reduce(
    (sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i],
    0,
  );
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].toSorted(
    (left, right) => left - right,
  );
  return (values[1] + 0.05) / (values[0] + 0.05);
}
test("six complete light/dark palettes preserve text contrast and sidebar inversion", () => {
  assert.equal(new Set(themePresets.map((theme) => theme.id)).size, 6);
  for (const theme of themePresets)
    for (const dark of [false, true]) {
      const colors = getThemeTokens(theme.id, dark);
      assert.ok(
        contrast(colors.ink, colors.canvas) >= 4.5,
        `${theme.id}: text`,
      );
      assert.ok(
        contrast(colors.primaryText, colors.primary) >= 4.5,
        `${theme.id}: button`,
      );
      assert.ok(
        contrast(colors.muted, colors.surface) >= 4.5,
        `${theme.id}: secondary text`,
      );
      assert.ok(
        contrast(colors.sidebarText, colors.sidebar) >= 4.5,
        `${theme.id}: sidebar`,
      );
      assert.equal(luminance(colors.sidebar) > 0.5, dark);
      assert.ok(
        !Object.values(getThemeCss(colors)).some((value) =>
          value.includes("gradient("),
        ),
      );
    }
});

const slots = (value: string) =>
  [...value.matchAll(/\{\{\s*[^}]+\s*\}\}|%[sd]/g)]
    .map((match) => match[0])
    .toSorted();
test("all five languages contain complete UI resources and unchanged placeholders", () => {
  for (const locale of Object.values(i18nResources)) {
    assert.deepEqual(
      Object.keys(locale).toSorted(),
      Object.keys(i18nResources.en).toSorted(),
    );
    for (const key of Object.keys(
      i18nResources.en,
    ) as (keyof typeof i18nResources.en)[])
      assert.deepEqual(slots(locale[key]), slots(i18nResources.en[key]), key);
  }
  const base = {
    ...workbenchTranslations.en,
    ...downloadTranslations.en,
    ...settingsTranslations.en,
  };
  for (const locale of [zhTWUi, jaUi, koUi]) {
    assert.deepEqual(
      Object.keys(locale).toSorted(),
      Object.keys(base).toSorted(),
    );
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
      assert.ok(locale[key].length);
      assert.deepEqual(slots(locale[key]), slots(base[key]), key);
    }
  }
});

test("proxy validation accepts supported schemes and rejects incomplete input", () => {
  for (const url of [
    "http://127.0.0.1:8000",
    "socks5://localhost:1080",
    "socks5h://user:password@localhost:1080",
    "https://proxy.example.com",
  ])
    assert.equal(isValidServiceUrl(url, true), true);
  for (const url of [
    "127.0.0.1:8000",
    "http://",
    "file:///tmp/proxy",
    "http://localhost/a",
    "http://local host",
  ])
    assert.equal(isValidServiceUrl(url, true), false);
  assert.equal(
    isValidServiceUrl("https://server.example.com/api", false),
    true,
  );
  assert.equal(isValidServiceUrl("socks5://localhost:1080", false), false);
});
