import { useMemoizedFn } from "ahooks";
import {
  cloneElement,
  memo,
  type PropsWithChildren,
  type ReactElement,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { themeSelector, useSessionStore } from "@/store/session";
import { cn } from "@/utils";
import { Tooltip } from "antd";

interface Props extends PropsWithChildren {
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactElement<{ className?: string; fill?: string }>;
}

export const IconButton = memo(function IconButton({
  children,
  disabled,
  title,
  onClick,
  icon,
}: Props) {
  const { theme } = useSessionStore(useShallow(themeSelector));
  const handleClick = useMemoizedFn(() => {
    if (disabled) {
      return;
    }
    onClick?.();
  });

  return (
    <Tooltip title={title}>
      <span className="inline-flex shrink-0">
        <button
          type="button"
          className="wb-tool-icon"
          aria-label={title}
          disabled={disabled}
          onClick={handleClick}
        >
          {icon &&
            cloneElement(icon, {
              className: cn(
                "h-4 w-4 text-[#020817] dark:text-[#B4B4B4]",
                icon.props.className,
              ),
              fill: theme === "dark" ? "#B4B4B4" : "#020817",
            })}
          {children}
        </button>
      </span>
    </Tooltip>
  );
});
