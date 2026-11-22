import { EyeInvisibleOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { Input } from "antd";
import { Tooltip } from "@/components/tooltip";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import {
  BackIcon,
  CloseIcon,
  FavFillIcon,
  FavIcon,
  HomeIcon,
  PCIcon,
  PhoneIcon,
  RefreshIcon,
  SendIcon,
  ShareIcon,
} from "@/assets/svg";
import { IconButton } from "@/components/icon-button";
import {
  appStoreSelector,
  setAppStoreSelector,
  useAppStore,
} from "@/store/app";
import {
  BrowserStatus,
  browserNavSelector,
  PageMode,
  setBrowserSelector,
  useBrowserStore,
} from "@/store/browser";
import { themeSelector, useSessionStore } from "@/store/session";
import { cn, getFavIcon } from "@/utils";
import { useBrowserActions } from "@/hooks/use-browser-actions";
import { useFavorites } from "@/hooks/use-favorites";
import { usePlatform } from "@/hooks/use-platform";
import { PanelRightOpen } from "lucide-react";

interface Props {
  page: boolean;
  focusUrl?: boolean;
  captureOpen: boolean;
  onCaptureToggle: () => void;
}

export function ToolBar({
  page,
  focusUrl = false,
  captureOpen,
  onCaptureToggle,
}: Props) {
  const { data: favoriteList, addFavorite, removeFavorite } = useFavorites();
  const { browser, app } = usePlatform();
  const { goto, goHome } = useBrowserActions();
  const { theme } = useSessionStore(useShallow(themeSelector));
  const store = useBrowserStore(useShallow(browserNavSelector));
  const { setBrowserStore } = useBrowserStore(useShallow(setBrowserSelector));
  const appStore = useAppStore(useShallow(appStoreSelector));
  const { setAppStore } = useAppStore(useShallow(setAppStoreSelector));
  const { t } = useTranslation();
  const resourceCount = useBrowserStore((state) => state.sources.length);

  const [address, setAddress] = useState(store.url);
  useEffect(() => setAddress(store.url), [store.url]);
  const atHome = store.mode !== PageMode.Browser;
  const disabled = atHome || store.status !== BrowserStatus.Loaded;

  // Set default UA
  const onSetDefaultUA = useMemoizedFn(() => {
    const nextMode = !appStore.isMobile;
    browser.setUserAgent(nextMode);
    setAppStore({
      isMobile: nextMode,
    });
  });

  const curIsFavorite = useMemo(() => {
    return favoriteList.find((item) => item.url === store.url);
  }, [favoriteList, store.url]);

  const onInputKeyDown = useMemoizedFn(
    async (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setAddress(store.url);
        return;
      }
      if (!address.trim() || e.key !== "Enter" || e.nativeEvent.isComposing)
        return;
      goto(address.trim());
    },
  );

  const onClickGoBack = useMemoizedFn(async () => {
    const back = await browser.back();
    if (!back) {
      setBrowserStore({ url: "", title: "", mode: PageMode.Default });
    }
  });

  const onClickEnter = useMemoizedFn(() => {
    if (!address.trim()) return;
    goto(address.trim());
  });

  const onClickAddFavorite = useMemoizedFn(async () => {
    if (curIsFavorite) {
      await removeFavorite(curIsFavorite.id);
    } else {
      const icon = getFavIcon(store.url);
      await addFavorite({
        url: store.url,
        title: store.title || store.url,
        icon,
      });
    }
  });

  const onCombineToHome = useMemoizedFn(() => {
    app.combineToHomePage({
      url: store.url,
      sourceList: [],
    });
  });

  const iconColor = theme === "dark" ? "white" : "black";

  return (
    <div
      className={cn("se-toolbar", { "se-toolbar-window": page })}
      role="group"
      aria-label={t("seAddress")}
    >
      <div className="se-navigation">
        <IconButton
          disabled={atHome}
          title={t("home")}
          onClick={goHome}
          icon={<HomeIcon fill={iconColor} />}
        />
        <IconButton
          disabled={atHome}
          title={t("back")}
          onClick={onClickGoBack}
          icon={<BackIcon fill={iconColor} />}
        />
        {store.mode === PageMode.Browser &&
        store.status === BrowserStatus.Loading ? (
          <IconButton
            title={t("cancle")}
            onClick={goHome}
            icon={<CloseIcon fill={iconColor} />}
          />
        ) : (
          <IconButton
            disabled={atHome}
            title={t("refresh")}
            onClick={() => {
              setAddress(store.url);
              goto(store.url);
            }}
            icon={<RefreshIcon fill={iconColor} />}
          />
        )}
      </div>
      <Input
        key="url-input"
        className="se-address"
        aria-label={t("seAddress")}
        data-testid="source-url"
        autoFocus={focusUrl}
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={onInputKeyDown}
        placeholder={t("pleaseEnterUrl")}
        prefix={
          appStore.privacy ? (
            <Tooltip placement="top" title={t("privacy")}>
              <EyeInvisibleOutlined />
            </Tooltip>
          ) : undefined
        }
      />
      <button
        type="button"
        className="wb-primary se-visit"
        onClick={onClickEnter}
        disabled={!address.trim()}
        data-testid="source-visit"
      >
        <SendIcon width={16} height={16} fill="currentColor" />
        {t("visit")}
      </button>
      <div className="se-tools">
        {!atHome && (
          <button
            type="button"
            className={cn("wb-secondary se-capture-toggle", {
              "is-active": captureOpen,
            })}
            data-testid="source-capture-toggle"
            aria-label={t("seCaptured")}
            aria-expanded={captureOpen}
            aria-controls="source-capture-drawer"
            onClick={onCaptureToggle}
          >
            <PanelRightOpen size={16} aria-hidden="true" />
            <span>{t("seResources")}</span>
            <strong data-testid="source-capture-badge" aria-live="polite">
              {resourceCount}
            </strong>
          </button>
        )}
        <IconButton
          title={curIsFavorite ? t("cancelFavorite") : t("favorite")}
          onClick={onClickAddFavorite}
          disabled={disabled}
          icon={
            curIsFavorite ? (
              <FavFillIcon fill={iconColor} />
            ) : (
              <FavIcon
                fill={iconColor}
                stroke={theme === "dark" ? "#B4B4B4" : "#020817"}
              />
            )
          }
        />
        <Tooltip
          title={t(appStore.isMobile ? "seSwitchDesktop" : "seSwitchMobile")}
        >
          <button
            type="button"
            className="se-device wb-secondary"
            onClick={onSetDefaultUA}
            aria-label={t(
              appStore.isMobile ? "seSwitchDesktop" : "seSwitchMobile",
            )}
            data-testid="source-device"
          >
            {appStore.isMobile ? (
              <PhoneIcon width={16} height={16} fill="currentColor" />
            ) : (
              <PCIcon width={16} height={16} fill="currentColor" />
            )}
            <span>{t(appStore.isMobile ? "seMobile" : "seDesktop")}</span>
          </button>
        </Tooltip>
        {page && (
          <IconButton
            title={t("mergeToMainWindow")}
            onClick={onCombineToHome}
            icon={<ShareIcon className="rotate-180" fill={iconColor} />}
          />
        )}
      </div>
    </div>
  );
}
