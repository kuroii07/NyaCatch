import { Tooltip as AntTooltip, type TooltipProps } from "antd";
import type { TooltipRef } from "antd/es/tooltip";
import { forwardRef } from "react";

/** Keep Ant Design's popup lifecycle and accessibility, with one hover delay. */
export const Tooltip = forwardRef<TooltipRef, TooltipProps>(function Tooltip(
  { mouseEnterDelay = 0.3, ...props },
  ref,
) {
  return <AntTooltip ref={ref} mouseEnterDelay={mouseEnterDelay} {...props} />;
});
