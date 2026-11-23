// Display branding is separate from APP_NAME, which owns existing data and URLs.
export const APP_PRODUCT_NAME = "NyaCatch";
export const APP_DISPLAY_NAME = "NyaCatch · 喵拾";
export const APP_BUILD_VERSION = "0.26.0";
export const APP_IS_STABLE = !APP_BUILD_VERSION.includes("-");
export const APP_PREVIEW_TITLE = APP_IS_STABLE
  ? `${APP_DISPLAY_NAME} ${APP_BUILD_VERSION}`
  : `${APP_DISPLAY_NAME} · 开发预览`;

export function toWindowsFileVersion(version: string): string {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.([1-9]\d*))?$/.exec(
      version,
    );
  if (!match) throw new Error(`Invalid NyaCatch product version: ${version}`);

  const parts = match.slice(1).map((value) => Number(value || 0));
  if (parts.some((part) => !Number.isSafeInteger(part) || part > 65535)) {
    throw new Error(`NyaCatch version component out of range: ${version}`);
  }
  return parts.join(".");
}
