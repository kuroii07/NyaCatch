import { en } from "./en";
import { zh } from "./zh";
import { zhTW } from "./zh-TW";
import { ja } from "./ja";
import { ko } from "./ko";

export const i18nResources = {
  en,
  zh,
  "zh-TW": zhTW,
  ja,
  ko,
} as const;

export const SUPPORTED_LANGUAGES = ["en", "zh", "zh-TW", "ja", "ko"] as const;
export const DEFAULT_BACKEND_NAMESPACE = "backend" as const;
export const DEFAULT_FRONTEND_APP = "main" as const;

export { en, zh };
