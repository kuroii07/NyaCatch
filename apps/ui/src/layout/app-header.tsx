import { useState } from "react";
import { App, Dropdown, Modal, Tooltip } from "antd";
import { CircleHelp, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLanguage, LANGUAGE_OPTIONS } from "@mediago/shared-common";
import { setConfigValue } from "@/api/config";
import { useAppStore } from "@/store/app";
import { usePlatform } from "@/hooks/use-platform";
import { cn } from "@/utils";
import brandIcon from "@/assets/brand/nyacatch.svg";

export function AppHeader({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const { shell } = usePlatform();
  const setAppStore = useAppStore((state) => state.setAppStore);
  const configuredLanguage = useAppStore((state) => state.language);
  const [about, setAbout] = useState(false);
  const [changing, setChanging] = useState(false);
  async function changeLanguage(language: AppLanguage) {
    setChanging(true);
    try {
      await setConfigValue("language", language);
      setAppStore({ language });
    } catch (reason) {
      message.error(
        reason instanceof Error ? reason.message : t("wbTasksError"),
      );
    } finally {
      setChanging(false);
    }
  }
  return (
    <header className={cn("wb-app-header", className)}>
      <div className="wb-brand">
        <img
          className="wb-brand-icon"
          data-testid="brand-icon"
          src={brandIcon}
          alt=""
          width={32}
          height={32}
          draggable={false}
        />
        <strong>{t("wbBrand")}</strong>
        <small>{t("wbBuild")}</small>
      </div>
      <div className="wb-header-actions">
        <Dropdown
          trigger={["click"]}
          menu={{
            selectedKeys: [configuredLanguage || i18n.resolvedLanguage || "en"],
            items: [
              { key: "system", label: t("followSystem") },
              ...LANGUAGE_OPTIONS.map((option) => ({
                key: option.value,
                label: option.label,
              })),
            ],
            onClick: ({ key }) => void changeLanguage(key as AppLanguage),
          }}
        >
          <button
            data-testid="toggle-language"
            className="wb-icon-button"
            aria-label={t("wbLanguage")}
            disabled={changing}
          >
            <Languages size={18} />
          </button>
        </Dropdown>
        <Tooltip title={t("wbAbout")}>
          <button
            className="wb-icon-button"
            aria-label={t("wbAbout")}
            onClick={() => setAbout(true)}
          >
            <CircleHelp size={18} />
          </button>
        </Tooltip>
      </div>
      <Modal
        title={t("wbAbout")}
        open={about}
        footer={null}
        onCancel={() => setAbout(false)}
      >
        <div className="wb-about-brand">
          <img src={brandIcon} alt="" width={64} height={64} />
          <div>
            <strong>{t("wbBrand")}</strong>
            <p>{t("wbBuild")}</p>
          </div>
        </div>
        <p className="wb-about-copy">{t("wbAboutText")}</p>
        <button
          className="wb-secondary"
          onClick={() =>
            void shell.open("https://github.com/mediago-dev/mediago")
          }
        >
          {t("wbCredits")}
        </button>
      </Modal>
    </header>
  );
}
