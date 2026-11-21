export const backgroundPresetIds = [
  "meadow",
  "cloud",
  "lake",
  "night",
] as const;
export type BackgroundSource =
  | "none"
  | "custom"
  | (typeof backgroundPresetIds)[number];
export type BackgroundPreferences = {
  source: BackgroundSource;
  opacity: number;
  blur: number;
  customImage: string;
};
export const defaultBackground: BackgroundPreferences = {
  source: "none",
  opacity: 20,
  blur: 8,
  customImage: "",
};
const imageLimit = 1500000;
const bounded = (input: unknown, fallback: number, max: number) =>
  typeof input === "number" && Number.isFinite(input)
    ? Math.round(Math.min(max, Math.max(0, input)))
    : fallback;
export function normalizeBackground(value: unknown): BackgroundPreferences {
  const saved =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const customImage =
    typeof saved.customImage === "string" &&
    saved.customImage.length <= imageLimit &&
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
      saved.customImage,
    )
      ? saved.customImage
      : "";
  const source =
    saved.source === "custom" && customImage
      ? "custom"
      : backgroundPresetIds.includes(
            saved.source as (typeof backgroundPresetIds)[number],
          )
        ? (saved.source as BackgroundSource)
        : "none";
  return {
    source,
    opacity: bounded(saved.opacity, 20, 100),
    blur: bounded(saved.blur, 8, 30),
    customImage,
  };
}
export async function prepareBackgroundImage(file: File): Promise<string> {
  if (
    !file.size ||
    file.size > 10 * 1024 * 1024 ||
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("Invalid background image");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40000000
    )
      throw new Error("Image dimensions exceeded");
    const scale = Math.min(
      1,
      1920 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image canvas unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.65]) {
      const result = canvas.toDataURL("image/webp", quality);
      if (
        normalizeBackground({ source: "custom", customImage: result })
          .source === "custom"
      )
        return result;
    }
    throw new Error("Image storage limit exceeded");
  } finally {
    URL.revokeObjectURL(url);
  }
}
