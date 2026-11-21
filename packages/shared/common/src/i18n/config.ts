export const DEFAULT_FALLBACK_LNG = "zh";
export const BASE_I18N_OPTIONS = {
  fallbackLng: DEFAULT_FALLBACK_LNG,
  supportedLngs: ["zh", "zh-TW", "en", "ja", "ko"],
  load: "currentOnly",
  interpolation: {
    escapeValue: false,
  },
} as const;

/**
 * Resolve a stored AppStore.language value to a real i18n key ("zh" | "en").
 *
 * The persisted language may be `"system"` (meta value meaning "follow OS locale").
 * Each process resolves it at apply-time by passing its own locale source:
 *   - Renderer: navigator.language
 *   - Electron main: app.getLocale()
 *
 * Pure function — callers are responsible for reading the raw locale.
 */
export function resolveAppLanguage(
  language: string | undefined,
  systemLocale: string | undefined,
): "zh" | "zh-TW" | "en" | "ja" | "ko" {
  const locale = (
    language && language !== "system" ? language : (systemLocale ?? "en")
  )
    .toLowerCase()
    .replace(/_/g, "-");
  if (locale.startsWith("zh")) {
    return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(locale) ? "zh-TW" : "zh";
  }
  if (locale === "ja" || locale.startsWith("ja-")) return "ja";
  if (locale === "ko" || locale.startsWith("ko-")) return "ko";
  return "en";
}

export const LANGUAGE_OPTIONS = [
  { value: "zh", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
] as const;
