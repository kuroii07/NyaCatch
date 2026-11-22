import { useLayoutEffect, useRef, type RefObject } from "react";
import { motionTiming, playMotion, reducedMotion } from "@/lib/motion";

export function useSidebarMotion(
  sidebar: RefObject<HTMLElement | null>,
  indicator: RefObject<HTMLSpanElement | null>,
  pathname: string,
  expanded: boolean,
) {
  const lastRoute = useRef(pathname);
  const initialized = useRef(false);
  const move = useRef<Animation | null>(null);
  const wiggle = useRef<Animation | null>(null);
  const interrupted = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    const host = sidebar.current,
      marker = indicator.current;
    if (!host || !marker) return;
    const preference = reducedMotion();
    const routeChanged = lastRoute.current !== pathname;
    lastRoute.current = pathname;
    const navigation = host.querySelector("nav");
    const update = (animate = false) => {
      const selected = host.querySelector<HTMLElement>('[aria-current="page"]');
      if (!selected) {
        marker.hidden = true;
        delete host.dataset.navIndicatorReady;
        return;
      }
      const old =
        initialized.current && !marker.hidden
          ? interrupted.current || marker.getBoundingClientRect()
          : null;
      interrupted.current = null;
      move.current?.cancel();
      const outer = host.getBoundingClientRect(),
        target = selected.getBoundingClientRect();
      const x = target.left - outer.left - host.clientLeft,
        y = target.top - outer.top - host.clientTop;
      const navBounds = navigation?.getBoundingClientRect();
      const inNav = navigation?.contains(selected);
      const clipTop =
        inNav && navBounds ? Math.max(0, navBounds.top - target.top) : 0;
      const clipBottom =
        inNav && navBounds ? Math.max(0, target.bottom - navBounds.bottom) : 0;
      marker.hidden = clipTop + clipBottom >= target.height;
      if (marker.style.height !== `${target.height}px`)
        marker.style.height = `${target.height}px`;
      marker.style.transform = `translate(${x}px, ${y}px)`;
      marker.style.clipPath = `inset(${clipTop}px 0 ${clipBottom}px 0 round 16px)`;
      host.dataset.navIndicatorReady = "true";
      if (animate && old && !marker.hidden) {
        const fromX = old.left - outer.left - host.clientLeft,
          fromY = old.top - outer.top - host.clientTop;
        const direction = Math.sign(y - fromY);
        const timing = motionTiming(host);
        move.current = playMotion(
          marker,
          [
            { transform: `translate(${fromX}px, ${fromY}px)` },
            {
              transform: `translate(${x}px, ${y + direction * 4}px)`,
              offset: 0.82,
            },
            { transform: `translate(${x}px, ${y}px)` },
          ],
          { duration: timing.base, easing: timing.out },
          "skip",
        );
      }
      initialized.current = true;
    };
    update(routeChanged);
    if (routeChanged) {
      wiggle.current?.cancel();
      const icon = host.querySelector('[aria-current="page"] svg');
      if (icon)
        wiggle.current = playMotion(
          icon,
          [
            { transform: "rotate(-8deg)" },
            { transform: "rotate(4deg)", offset: 0.55 },
            { transform: "none" },
          ],
          { duration: 260, easing: motionTiming(host).out },
          "skip",
        );
    }
    const geometryKey = () =>
      [
        getComputedStyle(host).paddingLeft,
        host.clientHeight,
        navigation?.clientHeight,
        navigation?.scrollTop,
      ].join(":");
    let measured = geometryKey();
    const geometry = () => {
      const next = geometryKey();
      if (next === measured) return;
      measured = next;
      update();
    };
    const onPreference = () => {
      wiggle.current?.cancel();
      update();
    };
    const resize = new ResizeObserver(geometry);
    resize.observe(host);
    if (navigation) resize.observe(navigation);
    navigation?.addEventListener("scroll", geometry, { passive: true });
    preference.addEventListener("change", onPreference);
    return () => {
      resize.disconnect();
      navigation?.removeEventListener("scroll", geometry);
      preference.removeEventListener("change", onPreference);
      interrupted.current = marker.hidden
        ? null
        : marker.getBoundingClientRect();
      move.current?.cancel();
      wiggle.current?.cancel();
    };
  }, [pathname, expanded, sidebar, indicator]);
}
