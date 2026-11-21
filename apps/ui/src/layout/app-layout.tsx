import { useAsyncEffect } from "ahooks";
import { type FC, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { CHANGE_PAGE } from "@/const";
import { setAppStoreSelector, useAppStore } from "@/store/app";
import { tdApp } from "@/utils";
import { AppHeader } from "./app-header";
import { AppSideBar } from "./app-side-bar";
import { getConfig } from "@/api/config";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppBackground } from "@/components/app-background";
import { useAppearance } from "@/store/appearance";

const App: FC = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const local = useAppStore((state) => state.local);
  const hasBackground = useAppearance(
    (state) => state.background.source !== "none",
  );
  const { setAppStore } = useAppStore(useShallow(setAppStoreSelector));

  useAsyncEffect(async () => {
    try {
      const configData = await getConfig();
      setAppStore(configData);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    tdApp.onEvent(CHANGE_PAGE, { page: location.pathname });
  }, [location.pathname]);

  return (
    <div className="media-app" data-background={hasBackground ? "on" : "off"}>
      <AppBackground />
      <AppHeader className="shrink-0" />
      <div className="wb-app-body">
        <AppSideBar />
        <main className="wb-main">
          <Outlet />
        </main>
      </div>
      <footer className="wb-statusbar">
        <FolderOpen size={15} />
        <span>{t("wbLocal")}</span>
        <span className="wb-status-path" title={local}>
          {local || "—"}
        </span>
        <small>{t("wbBuild")}</small>
      </footer>
    </div>
  );
};

export default App;
