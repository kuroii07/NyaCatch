import { normalizeBackground } from "./backgrounds";

export type ThemeId =
  | "cream"
  | "sky"
  | "celadon"
  | "iris"
  | "sakura"
  | "sunset";
export type ThemeColors = {
  canvas: string;
  surface: string;
  soft: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  progress: string;
  control: string;
  header: string;
  sidebar: string;
  sidebarText: string;
  sidebarHover: string;
  primary: string;
  primaryText: string;
  primaryHover: string;
  primaryActive: string;
  disabled: string;
  disabledText: string;
  focus: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  raised: string;
};

type Palette = {
  id: ThemeId;
  accent: string;
  strong: string;
  light: [string, string, string, string, string];
  dark: [string, string, string, string, string];
};
export const themePresets: Palette[] = [
  {
    id: "cream",
    accent: "#f2ca46",
    strong: "#72550a",
    light: ["#fffef7", "#ffffff", "#fff4c9", "#242a36", "#deded7"],
    dark: ["#181a1d", "#222529", "#2b2f34", "#fffef7", "#393f47"],
  },
  {
    id: "sky",
    accent: "#8ab9ee",
    strong: "#2c5d94",
    light: ["#f4f8fc", "#ffffff", "#e4eef9", "#243345", "#d7e1ed"],
    dark: ["#151d27", "#1e2a38", "#29394c", "#f0f6fc", "#3b5067"],
  },
  {
    id: "celadon",
    accent: "#8dcdb4",
    strong: "#28684f",
    light: ["#f4f9f5", "#ffffff", "#e1f0e7", "#263c34", "#d4e4da"],
    dark: ["#17231e", "#21312a", "#2c4036", "#f0f8f2", "#3c5548"],
  },
  {
    id: "iris",
    accent: "#baa6e9",
    strong: "#65458f",
    light: ["#f8f6fc", "#ffffff", "#eee7f8", "#352b45", "#e1d9ed"],
    dark: ["#201a29", "#2d253a", "#3b304c", "#f7f2fc", "#534363"],
  },
  {
    id: "sakura",
    accent: "#efa5bd",
    strong: "#964563",
    light: ["#fff7fa", "#ffffff", "#fbe6ee", "#462e39", "#ecd9e1"],
    dark: ["#291b23", "#382831", "#49333f", "#fff2f7", "#634653"],
  },
  {
    id: "sunset",
    accent: "#f5b17a",
    strong: "#914d21",
    light: ["#fff8f1", "#ffffff", "#fce9d8", "#433227", "#ebddcf"],
    dark: ["#271e18", "#362920", "#48372b", "#fff5ec", "#615044"],
  },
];

export function normalizeThemeId(value: unknown): ThemeId {
  return themePresets.some((theme) => theme.id === value)
    ? (value as ThemeId)
    : "cream";
}

export function getThemeTokens(id: ThemeId, dark: boolean): ThemeColors {
  const p = themePresets.find((theme) => theme.id === id) ?? themePresets[0];
  const [canvas, surface, soft, sidebar, line] = dark ? p.dark : p.light;
  const deep = p.light[3];
  return {
    canvas,
    surface,
    soft,
    line,
    accent: p.accent,
    ink: dark ? "#f2f3f5" : deep,
    muted: dark ? "#b0b6c1" : "#626975",
    progress: dark ? p.accent : p.strong,
    control: dark ? canvas : p.light[0],
    header: dark ? surface : soft,
    sidebar,
    sidebarText: dark ? deep : "#f8f9fc",
    sidebarHover: dark ? p.light[2] : p.dark[2],
    primary: dark ? p.accent : deep,
    primaryText: dark ? "#242a36" : "#fffef7",
    primaryHover: dark
      ? `color-mix(in srgb, ${p.accent} 86%, white)`
      : `color-mix(in srgb, ${deep} 85%, white)`,
    primaryActive: dark
      ? `color-mix(in srgb, ${p.accent} 86%, black)`
      : `color-mix(in srgb, ${deep} 85%, black)`,
    disabled: dark ? soft : "#e9eaed",
    disabledText: dark ? "#a8b0bd" : "#717985",
    focus: dark ? p.accent : p.strong,
    error: dark ? "#f29a91" : "#b93931",
    success: dark ? "#8dcdb4" : "#28765d",
    warning: dark ? "#e2bf79" : "#875d13",
    info: dark ? "#9ec5ec" : "#366c9d",
    raised: dark ? `color-mix(in srgb, ${surface} 90%, white)` : surface,
  };
}

export function getThemeCss(colors: ThemeColors): Record<string, string> {
  return Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [
      `--wb-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      value,
    ]),
  );
}

export function migrateAppearance(value: unknown) {
  const saved =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    sidebarExpanded: saved.sidebarExpanded === true,
    background: normalizeBackground(saved.background),
    themeId: saved.themeId
      ? normalizeThemeId(saved.themeId)
      : saved.accent === "blue"
        ? ("sky" as const)
        : saved.accent === "rose"
          ? ("sakura" as const)
          : ("cream" as const),
    legacyColors: { accent: saved.accent, progress: saved.progress },
  };
}
