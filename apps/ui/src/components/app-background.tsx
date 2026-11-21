import meadow from "@/assets/backgrounds/meadow.svg";
import cloud from "@/assets/backgrounds/cloud.svg";
import lake from "@/assets/backgrounds/lake.svg";
import night from "@/assets/backgrounds/night.svg";
import { useAppearance } from "@/store/appearance";

export const backgroundImages = { meadow, cloud, lake, night };
export function AppBackground() {
  const background = useAppearance((state) => state.background);
  if (background.source === "none") return null;
  const source =
    background.source === "custom"
      ? background.customImage
      : backgroundImages[background.source];
  return (
    <img
      className="app-background"
      data-testid="app-background"
      src={source}
      alt=""
      aria-hidden="true"
      style={{
        opacity: `var(--wb-background-opacity-preview, ${background.opacity / 100})`,
        filter: `blur(var(--wb-background-blur-preview, ${background.blur}px))`,
      }}
    />
  );
}
