import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppearance } from "@/store/appearance";
import { useSessionStore } from "@/store/session";
import { getThemeTokens, themePresets } from "@/themes";

export function AppearancePanel() {
  const { t } = useTranslation();
  const { themeId, setAppearance } = useAppearance();
  const dark = useSessionStore((state) => state.theme === "dark");
  return (
    <div
      className="s-theme-grid"
      role="radiogroup"
      aria-label={t("sThemeCollection")}
    >
      {themePresets.map(({ id }) => {
        const c = getThemeTokens(id, dark);
        return (
          <button
            key={id}
            type="button"
            className="s-theme-card"
            role="radio"
            aria-checked={themeId === id}
            data-testid={`theme-${id}`}
            title={`${t(`sTheme_${id}`)} · ${t(`sThemeDesc_${id}`)}`}
            onClick={() => setAppearance({ themeId: id })}
          >
            <span
              className="s-theme-preview"
              style={{ background: c.canvas, borderColor: c.line }}
              aria-hidden="true"
            >
              <span className="s-theme-top" style={{ background: c.header }} />
              <span
                className="s-theme-sidebar"
                style={{ background: c.sidebar }}
              >
                <i style={{ background: c.accent }} />
                <i style={{ background: c.sidebarText }} />
                <i style={{ background: c.sidebarText }} />
              </span>
              <span className="s-theme-content">
                <i style={{ background: c.surface, borderColor: c.line }} />
                <i style={{ background: c.soft }} />
                <i style={{ background: c.primary }} />
              </span>
            </span>
            <span className="s-theme-name">
              {t(`sTheme_${id}`)}
              {themeId === id && (
                <Check size={16} aria-label={t("sSelected")} />
              )}
            </span>
            <span className="s-theme-description">{t(`sThemeDesc_${id}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
