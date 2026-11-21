import { App, Tooltip, theme } from "antd";
import { useMemoizedFn } from "ahooks";
import {
  cloneElement,
  useEffect,
  useRef,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactElement,
} from "react";
import { useLocation } from "react-router-dom";
import { usePlatform } from "@/hooks/use-platform";
import { BrowserStatus, PageMode, useBrowserStore } from "@/store/browser";
import { isWeb } from "@/utils";

interface TriggerProps {
  onMouseEnter?: MouseEventHandler<HTMLElement>;
  onMouseLeave?: MouseEventHandler<HTMLElement>;
  onFocus?: FocusEventHandler<HTMLElement>;
  onBlur?: FocusEventHandler<HTMLElement>;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
}

export function SidebarTooltip({
  title,
  children,
}: {
  title?: string;
  placement?: "right";
  children: ReactElement<TriggerProps>;
}) {
  const { app } = usePlatform();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { pathname } = useLocation();
  const browserMode = useBrowserStore((state) => state.mode);
  const browserStatus = useBrowserStore((state) => state.status);
  const native =
    !isWeb &&
    pathname === "/source" &&
    browserMode === PageMode.Browser &&
    (browserStatus === BrowserStatus.Loading ||
      browserStatus === BrowserStatus.Loaded);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef(false);
  const hovered = useRef(false);
  const focused = useRef(false);
  const anchor = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  const reportError = useMemoizedFn((reason: unknown) => {
    if (mounted.current)
      message.error(reason instanceof Error ? reason.message : String(reason));
  });
  const hide = useMemoizedFn(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (sent.current) {
      sent.current = false;
      void app.setSidebarTooltip(null).catch(reportError);
    }
  });
  const show = useMemoizedFn((immediate = false) => {
    if (timer.current) clearTimeout(timer.current);
    if (!native || !title || !anchor.current) return;
    const display = () => {
      timer.current = null;
      const element = anchor.current;
      if (!element?.isConnected || (!hovered.current && !focused.current))
        return;
      const rect = element.getBoundingClientRect();
      sent.current = true;
      void app
        .setSidebarTooltip({
          text: title,
          anchor: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          background: token.colorBgSpotlight,
          color: token.colorTextLightSolid,
          fontSize: token.fontSize,
        })
        .catch(reportError);
    };
    if (immediate) display();
    else timer.current = setTimeout(display, 100);
  });
  useEffect(() => {
    if (native && (hovered.current || focused.current)) show(true);
    else hide();
    return hide;
  }, [
    native,
    title,
    token.colorBgSpotlight,
    token.colorTextLightSolid,
    token.fontSize,
    show,
    hide,
  ]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      hide();
    };
  }, [hide]);
  const trigger = cloneElement(children, {
    onMouseEnter: (event) => {
      children.props.onMouseEnter?.(event);
      hovered.current = true;
      anchor.current = event.currentTarget;
      show();
    },
    onMouseLeave: (event) => {
      children.props.onMouseLeave?.(event);
      hovered.current = false;
      if (!focused.current) hide();
    },
    onFocus: (event) => {
      children.props.onFocus?.(event);
      focused.current = event.currentTarget.matches(":focus-visible");
      anchor.current = event.currentTarget;
      if (focused.current) show(true);
    },
    onBlur: (event) => {
      children.props.onBlur?.(event);
      focused.current = false;
      if (!hovered.current) hide();
    },
    onKeyDown: (event) => {
      children.props.onKeyDown?.(event);
      if (event.key === "Escape") hide();
    },
  });
  // Ant Design remains the normal-page tooltip and keyboard accessibility path.
  // Only a visible native material page needs the owned native tooltip surface.
  return (
    <Tooltip
      title={native ? undefined : title}
      placement="right"
      trigger={["hover", "focus"]}
    >
      {trigger}
    </Tooltip>
  );
}
