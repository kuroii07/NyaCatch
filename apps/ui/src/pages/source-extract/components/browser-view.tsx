import { useMemoizedFn } from "ahooks";
import { Empty, Space, Spin } from "antd";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import WebView from "@/components/web-view";
import { useBrowserActions } from "@/hooks/use-browser-actions";
import { usePlatform } from "@/hooks/use-platform";
import {
  BrowserStatus,
  browserErrorSelector,
  setBrowserSelector,
  type SourceData,
  useBrowserStore,
} from "@/store/browser";
import { BrowserViewPanel } from "./browser-view-panel";

export function BrowserView({
  captureOpen,
  onClose,
}: {
  captureOpen: boolean;
  onClose: () => void;
}) {
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    if (captureOpen)
      drawer.current
        ?.querySelector<HTMLButtonElement>(
          '[data-testid="source-capture-close"]',
        )
        ?.focus();
  }, [captureOpen]);
  const { on, off } = usePlatform();
  const { goto, goHome } = useBrowserActions();
  const { status, errMsg, errCode } = useBrowserStore(
    useShallow(browserErrorSelector),
  );
  const url = useBrowserStore((s) => s.url);
  const { addSource } = useBrowserStore(useShallow(setBrowserSelector));
  const { t } = useTranslation();

  const onSourceDetected = useMemoizedFn((...args: unknown[]) => {
    addSource(args[1] as SourceData);
  });

  useEffect(() => {
    on("browser:sourceDetected", onSourceDetected);

    return () => {
      off("browser:sourceDetected", onSourceDetected);
    };
  }, []);

  const renderContent = useMemoizedFn(() => {
    // Loading or Loaded: show the WebView so the native WebContentsView is visible
    if (status === BrowserStatus.Loading || status === BrowserStatus.Loaded) {
      return (
        <div className="se-webview" data-testid="source-webview">
          <WebView className="h-full w-full flex-1" />
        </div>
      );
    }

    // Load failure
    if (status === BrowserStatus.Failed) {
      return (
        <div className="flex h-full w-full flex-row items-center justify-center">
          <Empty
            description={`${errMsg || t("loadFailed")}${errCode ? ` (${errCode})` : ""}`}
          >
            <Space>
              <Button onClick={goHome}>{t("backToHome")}</Button>
              <Button onClick={() => goto(url)}>{t("refresh")}</Button>
            </Space>
          </Empty>
        </div>
      );
    }

    return null;
  });

  return (
    <div className="se-browser" data-capture-open={captureOpen}>
      <div className="se-browser-pane">
        <div className="se-page-status" role="status">
          {status === BrowserStatus.Loading && <Spin size="small" />}
          <span>
            {t(
              status === BrowserStatus.Loading
                ? "seLoading"
                : status === BrowserStatus.Failed
                  ? "loadFailed"
                  : "seReady",
            )}
          </span>
          <small title={url}>{url}</small>
        </div>
        <div className="se-browser-content">{renderContent()}</div>
      </div>
      <aside
        ref={drawer}
        id="source-capture-drawer"
        className="se-drawer"
        data-testid="source-capture-drawer"
        hidden={!captureOpen}
        aria-label={t("seCaptured")}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <BrowserViewPanel onClose={onClose} />
      </aside>
    </div>
  );
}
