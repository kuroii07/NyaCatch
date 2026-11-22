import { App } from "antd";
import { Fragment, useRef } from "react";
import { SidebarTooltip as Tooltip } from "@/components/sidebar-tooltip";
import {
  CheckCircle2,
  Camera,
  Clapperboard,
  ChevronsLeft,
  ChevronsRight,
  Combine,
  Globe2,
  Compass,
  Layers,
  List,
  Moon,
  Plus,
  RefreshCw,
  Scissors,
  Settings2,
  Sun,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppTheme } from "@mediago/shared-common";
import { setConfigValue } from "@/api/config";
import { useAppearance } from "@/store/appearance";
import { useAppStore } from "@/store/app";
import { useSessionStore } from "@/store/session";
import { usePlatform } from "@/hooks/use-platform";
import { cn, isWeb } from "@/utils";
import { useSidebarMotion } from "@/hooks/use-sidebar-motion";
import { useBrandBadges } from "@/hooks/use-brand-badges";

export function AppSideBar({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { created, completed } = useBrandBadges();
  const { pathname } = useLocation();
  const { app } = usePlatform();
  const { message } = App.useApp();
  const theme = useSessionStore((state) => state.theme);
  const setAppStore = useAppStore((state) => state.setAppStore);
  const openInNewWindow = useAppStore((state) => state.openInNewWindow);
  const expanded = useAppearance((state) => state.sidebarExpanded);
  const sidebar = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  useSidebarMotion(sidebar, indicator, pathname, expanded);
  const setAppearance = useAppearance((state) => state.setAppearance);
  const links = [
    { path: "/", key: "wbNew", icon: Plus, group: "download" },
    { path: "/queue", key: "wbQueue", icon: List, group: "download" },
    {
      path: "/done",
      key: "wbCompleted",
      icon: CheckCircle2,
      group: "download",
    },
    ...(!isWeb
      ? [
          {
            path: "/converter",
            key: "converter",
            icon: RefreshCw,
            group: "media",
          },
          { path: "/trim", key: "trTitle", icon: Scissors, group: "media" },
          { path: "/merge", key: "mgTitle", icon: Combine, group: "media" },
          { path: "/capture", key: "capTitle", icon: Camera, group: "media" },
          {
            path: "/compress",
            key: "vpTitle",
            icon: Clapperboard,
            group: "media",
          },
          { path: "/mux", key: "mxTitle", icon: Layers, group: "media" },
          {
            path: "/source",
            key: "materialExtraction",
            icon: Globe2,
            group: "discover",
          },
        ]
      : []),
    { path: "/platforms", key: "pNav", icon: Compass, group: "discover" },
  ];
  async function toggleTheme() {
    const next = theme === "dark" ? AppTheme.Light : AppTheme.Dark;
    try {
      await setConfigValue("theme", next);
      setAppStore({ theme: next });
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("wbTasksError"),
      );
    }
  }
  return (
    <aside
      ref={sidebar}
      id="app-sidebar"
      className={cn("wb-sidebar", expanded && "is-expanded", className)}
    >
      <span
        ref={indicator}
        className="nc-sidebar-indicator"
        aria-hidden="true"
      />
      <nav aria-label={t("wbBrand")}>
        {links.map(({ path, key, icon: Icon, group }, index) => (
          <Fragment key={path}>
            {/* Visual-only group break: download / media tools / discover. */}
            {index > 0 && links[index - 1].group !== group && (
              <hr className="wb-nav-divider" aria-hidden="true" />
            )}
            <Tooltip title={expanded ? undefined : t(key)} placement="right">
              <Link
                to={path}
                aria-label={t(key)}
                aria-current={
                  pathname === path || (path === "/" && pathname === "/batch")
                    ? "page"
                    : undefined
                }
                className={cn(
                  "wb-nav-item",
                  (pathname === path ||
                    (path === "/" && pathname === "/batch")) &&
                    "is-active",
                )}
                onClick={(event) => {
                  if (path === "/source" && openInNewWindow) {
                    event.preventDefault();
                    void app.showBrowserWindow();
                  }
                }}
              >
                <Icon size={22} strokeWidth={1.8} />
                {path === "/queue" && created && (
                  <span
                    key={created.key}
                    className="nc-nav-badge"
                    aria-hidden="true"
                    data-testid="queue-created-badge"
                  >
                    +{created.count}
                  </span>
                )}
                {path === "/done" && completed > 0 && (
                  <span
                    key={completed}
                    className="nc-nav-badge nc-nav-badge--done"
                    aria-hidden="true"
                    data-testid="completed-badge"
                  />
                )}
                <span className="wb-nav-label">{t(key)}</span>
              </Link>
            </Tooltip>
          </Fragment>
        ))}
      </nav>
      <div className="wb-nav-bottom">
        <Tooltip title={expanded ? undefined : t("setting")} placement="right">
          <Link
            to="/settings"
            className={cn(
              "wb-nav-item",
              pathname === "/settings" && "is-active",
            )}
            aria-label={t("setting")}
            aria-current={pathname === "/settings" ? "page" : undefined}
          >
            <Settings2 size={21} />
            <span className="wb-nav-label">{t("setting")}</span>
          </Link>
        </Tooltip>
        <Tooltip title={t(expanded ? "collapse" : "expand")} placement="right">
          <button
            type="button"
            className="wb-nav-item"
            data-testid="toggle-sidebar"
            aria-label={t(expanded ? "collapse" : "expand")}
            aria-controls="app-sidebar"
            aria-expanded={expanded}
            onClick={() => setAppearance({ sidebarExpanded: !expanded })}
          >
            {expanded ? (
              <ChevronsLeft size={21} />
            ) : (
              <ChevronsRight size={21} />
            )}
            <span className="wb-nav-label">
              {t(expanded ? "collapse" : "expand")}
            </span>
          </button>
        </Tooltip>
        <Tooltip title={t("wbToggleTheme")} placement="right">
          <button
            className="wb-nav-item"
            data-testid="toggle-theme"
            aria-label={t("wbToggleTheme")}
            onClick={() => void toggleTheme()}
          >
            {theme === "dark" ? <Sun size={21} /> : <Moon size={21} />}
            <span className="wb-nav-label">
              {t(theme === "dark" ? "light" : "dark")}
            </span>
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
