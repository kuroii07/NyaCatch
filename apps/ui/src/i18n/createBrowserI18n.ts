import { settingsMaintenanceMessages } from "./settings-maintenance";
import { mediaParseMessages } from "./media-parse";
import { releaseMessages } from "./release";
import { converterOptionsTranslations } from "./converter-options";
import { trimMessages } from "./trim";
import { mergeMessages } from "./merge";
import { audioExtractMessages } from "./audio-extract";
import { captureMessages } from "./capture";
import { compressionMessages } from "./compress";
import { muxMessages } from "./mux";
import { previewMessages } from "./preview";
import { platformParserMessages } from "./platform-parser";
import { converterWorkflowMessages } from "./converter-workflow";
import { usabilityMessages } from "./usability";
import { backgroundMessages } from "./backgrounds";
import { sourceExtractMessages } from "./source-extract";
import { sourceHomeMessages } from "./source-home";
import { collectionMessages } from "./collections";
import { efficiencyTranslations } from "./download-efficiency";
import {
  BASE_I18N_OPTIONS,
  APP_IS_STABLE,
  i18nResources,
  SUPPORTED_LANGUAGES,
} from "@mediago/shared-common";
import { createInstance, i18n, type InitOptions, type Resource } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { workbenchTranslations } from "./workbench";
import { downloadTranslations } from "./downloads";
import { settingsTranslations } from "./settings";
import { zhTWUi } from "./locales/zh-TW";
import { jaUi } from "./locales/ja";
import { koUi } from "./locales/ko";
import { playbackTranslations } from "./playback";
import { multiResourceTranslations } from "./multi-resource";
import { platformTranslations } from "./platforms";
import { engineCatalogTranslations } from "./engine-catalog";
import { batchTranslations } from "./batch";
import { converterTranslations } from "./converter";
import { converterWorkbenchTranslations } from "./converter-workbench";

export interface BrowserResourceOptions {
  includeBackend?: boolean;
}

export interface CreateBrowserI18nOptions extends BrowserResourceOptions {
  debug?: boolean;
}

const buildTranslationBundle = (
  language: (typeof SUPPORTED_LANGUAGES)[number],
) => {
  const translation: Record<string, string> = { ...i18nResources[language] };

  const ui = {
    zh: {
      ...workbenchTranslations.zh,
      ...downloadTranslations.zh,
      ...settingsTranslations.zh,
    },
    en: {
      ...workbenchTranslations.en,
      ...downloadTranslations.en,
      ...settingsTranslations.en,
    },
    "zh-TW": zhTWUi,
    ja: jaUi,
    ko: koUi,
  };
  Object.assign(translation, ui[language]);
  Object.assign(translation, playbackTranslations[language]);
  Object.assign(translation, multiResourceTranslations[language]);
  Object.assign(translation, platformTranslations[language]);
  Object.assign(translation, engineCatalogTranslations[language]);
  Object.assign(translation, batchTranslations[language]);
  Object.assign(translation, converterTranslations[language]);
  Object.assign(translation, converterWorkbenchTranslations[language]);

  Object.assign(translation, efficiencyTranslations[language]);
  Object.assign(translation, converterOptionsTranslations[language]);
  Object.assign(translation, trimMessages[language]);
  Object.assign(translation, mergeMessages[language]);
  Object.assign(translation, audioExtractMessages[language]);
  Object.assign(translation, captureMessages[language]);
  Object.assign(translation, compressionMessages[language]);
  Object.assign(translation, muxMessages[language]);
  Object.assign(translation, previewMessages[language]);
  Object.assign(translation, settingsMaintenanceMessages[language]);
  Object.assign(translation, platformParserMessages[language]);
  Object.assign(translation, converterWorkflowMessages[language]);
  Object.assign(translation, usabilityMessages[language]);
  Object.assign(translation, backgroundMessages[language]);
  Object.assign(translation, sourceExtractMessages[language]);
  Object.assign(translation, sourceHomeMessages[language]);
  Object.assign(translation, collectionMessages[language]);
  Object.assign(translation, mediaParseMessages[language]);
  Object.assign(
    translation,
    Object.fromEntries(
      Object.entries(releaseMessages[language]).filter(
        ([key]) => APP_IS_STABLE || key.startsWith("su"),
      ),
    ),
  );
  return translation;
};

export const buildBrowserResources = (): Resource => {
  return SUPPORTED_LANGUAGES.reduce<Resource>((acc, language) => {
    acc[language] = {
      translation: buildTranslationBundle(language),
    };

    return acc;
  }, {} as Resource);
};

export function createBrowserI18n({
  debug = false,
}: CreateBrowserI18nOptions = {}): i18n {
  const instance = createInstance();

  instance.use(LanguageDetector).use(initReactI18next);

  const resources = buildBrowserResources();

  void instance.init({
    ...BASE_I18N_OPTIONS,
    debug,
    resources,
  } satisfies InitOptions);

  return instance;
}
