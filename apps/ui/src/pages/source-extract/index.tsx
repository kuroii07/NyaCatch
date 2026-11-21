import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { type FC, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import PageContainer from "@/components/page-container";
import { setAppStoreSelector, useAppStore } from "@/store/app";
import {
  BrowserStatus,
  PageMode,
  setBrowserSelector,
  useBrowserStore,
} from "@/store/browser";
import { cn } from "@/utils";
import { BrowserView } from "./components/browser-view";
import { FavoriteList } from "./components/favorite-list";
import { ToolBar } from "./components/tool-bar";
import { usePlatform } from "@/hooks/use-platform";
import { getConfig } from "@/api/config";
import { findPlatform } from "../platforms-page/platforms";
import "./source-extract.css";

interface SourceExtractProps {
  page?: boolean;
}

const SourceExtract: FC<SourceExtractProps> = ({ page = false }) => {
  const { on, off, app, browser } = usePlatform();
  const [searchParams] = useSearchParams();
  const platformId = searchParams.get("platform");
  const { setAppStore } = useAppStore(useShallow(setAppStoreSelector));
  const mode = useBrowserStore((s) => s.mode);
  const [captureOpen, setCaptureOpen] = useState(false);
  useEffect(() => {
    if (mode !== PageMode.Browser) setCaptureOpen(false);
  }, [mode]);
  const closeCapture = useMemoizedFn(() => {
    setCaptureOpen(false);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(
          '[data-testid="source-capture-toggle"]',
        )
        ?.focus(),
    );
  });
  const title = useBrowserStore((s) => s.title);
  const { setBrowserStore } = useBrowserStore(useShallow(setBrowserSelector));
  const originTitle = useRef(document.title);

  useEffect(() => {
    const unsubscribe = useBrowserStore.subscribe(
      (state) => ({
        url: state.url,
        title: state.title,
        mode: state.mode,
        status: state.status,
      }),
      (selected) => {
        app.setSharedState(selected);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useAsyncEffect(async () => {
    try {
      const configData = await getConfig();
      setAppStore(configData);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const platform = findPlatform(platformId);
    async function restoreAndNavigate() {
      try {
        const state = await app.getSharedState();
        if (disposed) return;
        if (state) setBrowserStore(state as Partial<BrowserStore>);
        if (platform) {
          // Restore first so an older browser session cannot overwrite this action.
          useBrowserStore.getState().startNavigation(platform.website);
          await browser.loadURL(platform.website);
        }
      } catch (reason) {
        if (!disposed)
          setBrowserStore({
            status: BrowserStatus.Failed,
            errMsg: reason instanceof Error ? reason.message : String(reason),
          });
      }
    }
    void restoreAndNavigate();
    return () => {
      disposed = true;
    };
  }, [platformId, app, browser, setBrowserStore]);

  useEffect(() => {
    on("browser:domReady", onDomReady);
    on("browser:failLoad", onFailLoad);
    on("browser:didNavigate", onDidNavigate);
    on("browser:didNavigateInPage", onDidNavigateInPage);

    return () => {
      off("browser:domReady", onDomReady);
      off("browser:failLoad", onFailLoad);
      off("browser:didNavigate", onDidNavigate);
      off("browser:didNavigateInPage", onDidNavigateInPage);
    };
  }, []);

  const setPageInfo = useMemoizedFn(({ url, title: pageTitle }: UrlDetail) => {
    setBrowserStore({ url, title: pageTitle });
  });

  const onDomReady = useMemoizedFn((...args: unknown[]) => {
    setPageInfo(args[1] as UrlDetail);
  });

  const onFailLoad = useMemoizedFn((...args: unknown[]) => {
    const data = args[1] as { code: number; desc: string };
    setBrowserStore({
      status: BrowserStatus.Failed,
      errCode: data.code,
      errMsg: data.desc,
    });
  });

  const onDidNavigate = useMemoizedFn((...args: unknown[]) => {
    setPageInfo(args[1] as UrlDetail);
    setBrowserStore({ status: BrowserStatus.Loaded });
  });

  const onDidNavigateInPage = useMemoizedFn((...args: unknown[]) => {
    setPageInfo(args[1] as UrlDetail);
  });

  useEffect(() => {
    document.title = title || document.title;
    return () => {
      document.title = originTitle.current;
    };
  }, [title]);

  return (
    <PageContainer
      className="se-content"
      wrapperClassName={cn("se-page", { "se-window": page })}
    >
      <ToolBar
        page={page}
        focusUrl={!!findPlatform(platformId)}
        captureOpen={captureOpen}
        onCaptureToggle={() => setCaptureOpen((value) => !value)}
      />
      <div className="se-workspace" data-testid="source-extract-page">
        {mode === PageMode.Browser ? (
          <BrowserView captureOpen={captureOpen} onClose={closeCapture} />
        ) : (
          <FavoriteList />
        )}
      </div>
    </PageContainer>
  );
};

export default SourceExtract;
