import type { Rectangle, SidebarTooltipRequest } from "@mediago/shared-common";

export function validateSidebarTooltip(
  value: unknown,
): SidebarTooltipRequest | null {
  if (value === null) return null;
  if (!value || typeof value !== "object")
    throw new Error("Invalid sidebar tooltip");
  const request = value as SidebarTooltipRequest;
  const rect = request.anchor;
  if (
    typeof request.text !== "string" ||
    !request.text.trim() ||
    request.text.length > 160 ||
    !rect ||
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.x < 0 ||
    rect.x + rect.width > 512 ||
    rect.y < 0 ||
    rect.y > 16384 ||
    rect.width < 1 ||
    rect.width > 400 ||
    rect.height < 1 ||
    rect.height > 200 ||
    !Number.isFinite(request.fontSize) ||
    request.fontSize < 10 ||
    request.fontSize > 24 ||
    typeof request.background !== "string" ||
    !/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(request.background) ||
    typeof request.color !== "string" ||
    !/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(request.color)
  ) {
    throw new Error("Invalid sidebar tooltip");
  }
  return {
    text: request.text,
    anchor: { ...rect },
    background: request.background,
    color: request.color,
    fontSize: request.fontSize,
  };
}

export function sidebarTooltipBounds(
  anchor: Rectangle,
  parent: Rectangle,
  workArea: Rectangle,
  size: { width: number; height: number },
  zoom = 1,
): Rectangle {
  const width = Math.min(Math.ceil(size.width), workArea.width - 4);
  const height = Math.min(Math.ceil(size.height), workArea.height - 4);
  return {
    x: Math.round(
      Math.max(
        workArea.x + 2,
        Math.min(
          parent.x + (anchor.x + anchor.width) * zoom + 4,
          workArea.x + workArea.width - width - 2,
        ),
      ),
    ),
    y: Math.round(
      Math.max(
        workArea.y + 2,
        Math.min(
          parent.y + (anchor.y + anchor.height / 2) * zoom - height / 2,
          workArea.y + workArea.height - height - 2,
        ),
      ),
    ),
    width,
    height,
  };
}
