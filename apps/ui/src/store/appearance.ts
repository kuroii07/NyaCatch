import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  defaultBackground,
  normalizeBackground,
  type BackgroundPreferences,
} from "@/backgrounds";
import { migrateAppearance, normalizeThemeId, type ThemeId } from "@/themes";
type Preferences = {
  sidebarExpanded: boolean;
  themeId: ThemeId;
  background: BackgroundPreferences;
  legacyColors?: { accent: unknown; progress: unknown };
  setAppearance: (
    value: Partial<
      Pick<Preferences, "sidebarExpanded" | "themeId" | "background">
    >,
  ) => boolean;
};

// Use the same renderer preference storage pattern as the existing app store.
export const useAppearance = create<Preferences>()(
  persist(
    (set, get) => ({
      sidebarExpanded: false,
      themeId: "cream",
      background: defaultBackground,
      setAppearance: (value) => {
        const next = {
          ...get(),
          ...value,
          themeId: normalizeThemeId(value.themeId ?? get().themeId),
          background: normalizeBackground(value.background ?? get().background),
        };
        try {
          localStorage.setItem(
            "media-workbench-appearance",
            JSON.stringify({ state: next, version: 3 }),
          );
        } catch {
          return false;
        }
        set(next);
        return true;
      },
    }),
    {
      name: "media-workbench-appearance",
      version: 3,
      storage: createJSONStorage(() => ({
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => {
          if (localStorage.getItem(key) !== value)
            localStorage.setItem(key, value);
        },
        removeItem: (key) => localStorage.removeItem(key),
      })),
      migrate: migrateAppearance,
      merge: (saved, current) => ({
        ...current,
        ...migrateAppearance(saved),
        ...(saved && typeof saved === "object" && "legacyColors" in saved
          ? { legacyColors: saved.legacyColors as Preferences["legacyColors"] }
          : {}),
      }),
    },
  ),
);

// Independent media-browser windows share localStorage but not Zustand instances.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (
      event.storageArea === window.localStorage &&
      event.key === "media-workbench-appearance" &&
      event.newValue !== null
    ) {
      void useAppearance.persist.rehydrate();
    }
  });
}
