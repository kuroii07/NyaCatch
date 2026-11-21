import { App } from "antd";
import { SidebarTooltip as Tooltip } from "@/components/sidebar-tooltip";
import {
  CheckCircle2,
  Camera,
  Clapperboard,
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  Globe2,
  Compass,
  List,
  Moon,
  Plus,
  RefreshCw,
  Scissors,
  ListPlus,
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

export function AppSideBar({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { app } = usePlatform();
  const { message } = App.useApp();
  const theme = useSessionStore((state) => state.theme);
  const setAppStore = useAppStore((state) => state.setAppStore);
  const openInNewWindow = useAppStore((state) => state.openInNewWindow);
  const expanded = useAppearance((state) => state.sidebarExpanded);
  const setAppearance = useAppearance((state) => state.setAppearance);
  const links = [
    { path: "/", key: "wbNew", icon: Plus },
    { path: "/queue", key: "wbQueue", icon: List },
    { path: "/done", key: "wbCompleted", icon: CheckCircle2 },
    ...(!isWeb
      ? [
          { path: "/converter", key: "converter", icon: RefreshCw },
          { path: "/trim", key: "trTitle", icon: Scissors },
          { path: "/merge", key: "mgTitle", icon: ListPlus },
          { path: "/capture", key: "capTitle", icon: Camera },
          { path: "/compress", key: "vpTitle", icon: Clapperboard },
          { path: "/mux", key: "mxTitle", icon: Boxes },
          { path: "/source", key: "materialExtraction", icon: Globe2 },
        ]
      : []),
    { path: "/platforms", key: "pNav", icon: Compass },
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
      id="app-sidebar"
      className={cn("wb-sidebar", expanded && "is-expanded", className)}
    >
      <nav aria-label={t("wbBrand")}>
        {links.map(({ path, key, icon: Icon }) => (
          <Tooltip
            key={path}
            title={expanded ? undefined : t(key)}
            placement="right"
          >
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
              <span className="wb-nav-label">{t(key)}</span>
            </Link>
          </Tooltip>
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
