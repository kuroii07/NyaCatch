import { App as AntdApp, ConfigProvider, theme as antdTheme } from "antd";
import {
  type FC,
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { Route, Routes } from "react-router-dom";
import "dayjs/locale/zh-cn";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import zhCN from "antd/es/locale/zh_CN";
import enUS from "antd/es/locale/en_US";
import zhTW from "antd/es/locale/zh_TW";
import jaJP from "antd/es/locale/ja_JP";
import koKR from "antd/es/locale/ko_KR";
import dayjs from "dayjs";
import "dayjs/locale/zh-tw";
import "dayjs/locale/ja";
import "dayjs/locale/ko";
import i18n from "./i18n";
import { useAppearance } from "./store/appearance";
import { getThemeTokens, getThemeCss } from "./themes";
import { useShallow } from "zustand/react/shallow";
import Loading from "./components/loading";
import { PAGE_LOAD } from "./const";
import {
  appStoreSelector,
  setAppStoreSelector,
  useAppStore,
} from "./store/app";
import { PageMode, setBrowserSelector, useBrowserStore } from "./store/browser";
import {
  themeSelector,
  updateSelector,
  useSessionStore,
} from "./store/session";
import { isWeb, resolveAppLanguage, tdApp } from "./utils";
import { usePlatform } from "./hooks/use-platform";
import { setupHttp } from "./utils/http";
import { getConfig } from "./api/config";
import { initGoEvents, onConfigChanged } from "./api/events";
import { DownloadFilter } from "@mediago/shared-common";
import "./components/brand-moments.css";
import { useAuth } from "./hooks/use-auth";
import { Locale } from "antd/es/locale";

const AppLayout = lazy(() => import("./layout/app-layout"));
const HomePage = lazy(() => import("./pages/tasks-page"));
const WorkbenchPage = lazy(() => import("./pages/workbench-page"));
const BatchPage = lazy(() => import("./pages/batch-page"));
const PlatformsPage = lazy(() => import("./pages/platforms-page"));
const SourceExtract = lazy(() => import("./pages/source-extract"));
const SettingPage = lazy(() => import("./pages/setting-page"));
const ConverterPage = lazy(() => import("./pages/converter-page"));
const TrimPage = lazy(() => import("./pages/trim-page"));
const MergePage = lazy(() => import("./pages/merge-page"));
const CapturePage = lazy(() => import("./pages/capture-page"));
const CompressPage = lazy(() => import("./pages/compress-page"));
const MuxPage = lazy(() => import("./pages/mux-page"));
const SigninPage = lazy(() => import("./pages/signin-page"));
const OverlayDialog = lazy(() => import("./pages/overlay-dialog"));

function getAlgorithm(appTheme: "dark" | "light") {
  return appTheme === "dark"
    ? antdTheme.darkAlgorithm
    : antdTheme.defaultAlgorithm;
}

const App: FC = () => {
  useAuth();
  const { on, off } = usePlatform();
  const { setUpdateAvailable, setUploadChecking } = useSessionStore(
    useShallow(updateSelector),
  );
  const { setAppStore } = useAppStore(useShallow(setAppStoreSelector));
  const { language } = useAppStore(useShallow(appStoreSelector));
  const { setBrowserStore } = useBrowserStore(useShallow(setBrowserSelector));
  const { theme, setTheme } = useSessionStore(useShallow(themeSelector));
  const [appLocale, setAppLocale] = useState<Locale>();
  const [adapterReady, setAdapterReady] = useState(false);
  // Mount the motion provider disabled first so later preference changes keep its tree stable.
  const [reducedMotion, setReducedMotion] = useState(true);
  const configuredTheme = useAppStore((state) => state.theme);
  const themeId = useAppearance((state) => state.themeId);
  const colors = getThemeTokens(themeId, theme === "dark");

  useEffect(() => {
    if (!adapterReady) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", update);
    update();
    return () => preference.removeEventListener("change", update);
  }, [adapterReady]);

  useLayoutEffect(() => {
    document.documentElement.dataset.ncMotion = reducedMotion
      ? "reduced"
      : "full";
  }, [reducedMotion]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = themeId;
    for (const [key, value] of Object.entries(
      getThemeCss(getThemeTokens(themeId, theme === "dark")),
    ))
      root.style.setProperty(key, value);
  }, [themeId, theme]);

  useEffect(() => {
    const resolved = resolveAppLanguage(language);
    setAppLocale(
      { zh: zhCN, "zh-TW": zhTW, en: enUS, ja: jaJP, ko: koKR }[resolved],
    );
    dayjs.locale(
      { zh: "zh-cn", "zh-TW": "zh-tw", en: "en", ja: "ja", ko: "ko" }[resolved],
    );
    void i18n.changeLanguage(resolved);
  }, [language]);

  const themeChange = useMemoizedFn((event: MediaQueryListEvent) => {
    if (useAppStore.getState().theme !== "system") return;
    document.documentElement.classList.toggle("dark", event.matches);
    document.documentElement.style.colorScheme = event.matches
      ? "dark"
      : "light";
    if (event.matches) {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  });

  // 监听config变化
  const handleConfigChanged = useMemoizedFn(
    (_event: unknown, data: { key: string; value: unknown }) => {
      setAppStore({ [data.key]: data.value });
    },
  );

  const onChangePrivacy = useMemoizedFn(() => {
    setBrowserStore({ url: "", title: "", mode: PageMode.Default });
  });

  useEffect(() => {
    const onUpdateAvailable = () => {
      setUpdateAvailable(true);
      setUploadChecking(false);
    };
    const onUpdateNotAvailable = () => {
      setUpdateAvailable(false);
      setUploadChecking(false);
    };
    const checkingForUpdate = () => {
      setUploadChecking(true);
    };
    // Go SSE events
    const unsubConfig = onConfigChanged(handleConfigChanged);

    // Electron IPC events
    on("browser:privacyChanged", onChangePrivacy);
    on("update:available", onUpdateAvailable);
    on("update:notAvailable", onUpdateNotAvailable);
    on("update:checking", checkingForUpdate);

    return () => {
      unsubConfig();
      off("browser:privacyChanged", onChangePrivacy);
      off("update:available", onUpdateAvailable);
      off("update:notAvailable", onUpdateNotAvailable);
      off("update:checking", checkingForUpdate);
    };
  }, []);

  useAsyncEffect(async () => {
    if (!adapterReady) return;
    try {
      const config = await getConfig();
      const deviceId = config.machineId || "";
      tdApp.onEvent(PAGE_LOAD, { deviceId });
    } catch {
      tdApp.onEvent(PAGE_LOAD, { deviceId: "" });
    }
  }, [adapterReady]);

  useAsyncEffect(async () => {
    try {
      let coreUrl = "";

      if (isWeb) {
        // Web mode: Go Core serves both API and static files, same origin
        coreUrl = import.meta.env.DEV
          ? "http://127.0.0.1:9900"
          : window.location.origin;
        setupHttp(coreUrl);
        initGoEvents(coreUrl);
      } else {
        // Electron mode: get coreUrl directly from preload IPC
        // FIXME: wait for Go Core to fully start
        await new Promise((r) => setTimeout(r, 1000));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ipcResult: any = await window.electron?.app?.getEnvPath();
        const envPath = ipcResult?.code === 0 ? ipcResult.data : ipcResult;
        if (envPath?.coreUrl) {
          coreUrl = envPath.coreUrl;
          setupHttp(coreUrl);
          initGoEvents(coreUrl);
        }
      }

      // Sync config from Go Core (single source of truth) to Zustand
      if (coreUrl) {
        try {
          const config = await getConfig();
          if (config) {
            setAppStore(config);
          }
        } catch {
          // Go Core may not be fully ready yet
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Go adapter init failed:", err);
    } finally {
      setAdapterReady(true);
    }
  }, []);

  useEffect(() => {
    const isDarkTheme = matchMedia("(prefers-color-scheme: dark)");
    isDarkTheme.addEventListener("change", themeChange);

    if (isDarkTheme.matches) {
      setTheme("dark");
    } else {
      setTheme("light");
    }

    return () => {
      isDarkTheme.removeEventListener("change", themeChange);
    };
  }, []);

  useEffect(() => {
    const resolved =
      configuredTheme === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : configuredTheme;
    setTheme(resolved);
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  }, [configuredTheme, setTheme]);

  useEffect(() => {
    document.documentElement.lang = resolveAppLanguage(language);
  }, [language]);

  if (!adapterReady) {
    return <Loading />;
  }

  return (
    <ConfigProvider
      locale={appLocale}
      wave={{ disabled: reducedMotion }}
      componentSize="middle"
      tooltip={{ className: "nc-motion-tooltip" }}
      theme={{
        algorithm: getAlgorithm(theme),
        token: {
          motion: !reducedMotion,
          colorPrimary: colors.focus,
          colorBgBase: colors.canvas,
          colorBgContainer: colors.surface,
          colorBgElevated: colors.raised,
          colorSuccess: colors.success,
          colorWarning: colors.warning,
          colorError: colors.error,
          colorInfo: colors.info,
          motionDurationFast: "0.14s",
          motionDurationMid: "0.22s",
          motionDurationSlow: "0.36s",
          motionEaseInOut: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          fontSize: 13,
          fontSizeSM: 12,
          fontSizeLG: 16,
          colorBgContainerDisabled: colors.disabled,
          colorBorder: colors.line,
          colorBorderSecondary: colors.line,
          colorSplit: colors.line,
          colorText: colors.ink,
          colorTextSecondary: colors.muted,
          colorTextTertiary: colors.muted,
          colorTextDisabled: colors.disabledText,
          colorBgSpotlight: theme === "dark" ? colors.soft : colors.primary,
          controlItemBgHover: colors.soft,
          controlItemBgActive: colors.soft,
          borderRadius: 10,
          fontFamily:
            '"HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Microsoft JhengHei UI", "Yu Gothic UI", "Malgun Gothic", sans-serif',
        },
        components: {
          Input: {
            activeShadow: `inset 0 0 0 1px ${colors.focus}`,
            errorActiveShadow: "none",
            warningActiveShadow: "none",
          },
          InputNumber: {
            activeShadow: `inset 0 0 0 1px ${colors.focus}`,
            errorActiveShadow: "none",
            warningActiveShadow: "none",
          },
          Select: {
            controlOutlineWidth: 0,
          },
          Radio: {
            buttonSolidCheckedBg: colors.primary,
            buttonSolidCheckedColor: colors.primaryText,
            buttonSolidCheckedHoverBg: colors.primaryHover,
            buttonSolidCheckedActiveBg: colors.primaryActive,
          },
        },
      }}
    >
      <AntdApp
        className="size-full overflow-hidden"
        message={{
          top: 48,
          classNames: { root: "nc-motion-message" },
          styles: { root: { textAlign: "start", paddingInline: 22 } },
        }}
      >
        <Routes>
          <Route
            path="/"
            element={
              <Suspense fallback={<Loading />}>
                <AppLayout />
              </Suspense>
            }
          >
            <Route
              index
              element={
                <Suspense fallback={<Loading />}>
                  <WorkbenchPage />
                </Suspense>
              }
            />
            <Route
              path="batch"
              element={
                <Suspense fallback={<Loading />}>
                  <BatchPage />
                </Suspense>
              }
            />
            <Route
              path="queue"
              element={
                <Suspense fallback={<Loading />}>
                  <HomePage />
                </Suspense>
              }
            />
            <Route
              path="done"
              element={
                <Suspense fallback={<Loading />}>
                  <HomePage filter={DownloadFilter.done} />
                </Suspense>
              }
            />
            <Route
              path="source"
              element={
                <Suspense fallback={<Loading />}>
                  <SourceExtract />
                </Suspense>
              }
            />
            <Route
              path="platforms"
              element={
                <Suspense fallback={<Loading />}>
                  <PlatformsPage />
                </Suspense>
              }
            />
            <Route
              path="settings"
              element={
                <Suspense fallback={<Loading />}>
                  <SettingPage />
                </Suspense>
              }
            />
            <Route
              path="converter"
              element={
                <Suspense fallback={<Loading />}>
                  <ConverterPage />
                </Suspense>
              }
            />

            <Route
              path="trim"
              element={
                <Suspense fallback={<Loading />}>
                  <TrimPage />
                </Suspense>
              }
            />
            <Route
              path="merge"
              element={
                <Suspense fallback={<Loading />}>
                  <MergePage />
                </Suspense>
              }
            />
            <Route
              path="capture"
              element={
                <Suspense fallback={<Loading />}>
                  <CapturePage />
                </Suspense>
              }
            />
            <Route
              path="compress"
              element={
                <Suspense fallback={<Loading />}>
                  <CompressPage />
                </Suspense>
              }
            />
            <Route
              path="mux"
              element={
                <Suspense fallback={<Loading />}>
                  <MuxPage />
                </Suspense>
              }
            />
            <Route path="*" element={<div>404</div>} />
          </Route>
          <Route
            path="signin"
            element={
              <Suspense fallback={<Loading />}>
                <SigninPage />
              </Suspense>
            }
          />
          <Route
            path="/browser"
            element={
              <Suspense fallback={<Loading />}>
                <SourceExtract page={true} />
              </Suspense>
            }
          />
          <Route
            path="/download-dialog"
            element={
              <Suspense fallback={<Loading />}>
                <OverlayDialog />
              </Suspense>
            }
          />
        </Routes>
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
