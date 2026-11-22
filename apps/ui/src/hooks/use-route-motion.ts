import { useLayoutEffect, useRef, type RefObject } from "react";
import { motionTiming, playMotion, reducedMotion } from "@/lib/motion";

export function useRouteMotion(
  ref: RefObject<HTMLElement | null>,
  pathname: string,
) {
  const previous = useRef(pathname);
  useLayoutEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const element = ref.current;
    if (!element) return;
    let animation: Animation | null = null;
    let started = false;
    const preference = reducedMotion();
    const onPreference = () => animation?.cancel();
    const observer = new MutationObserver(() => start());
    const start = () => {
      if (started) return;
      // A lazy page can still be showing its Suspense loader at the route commit.
      const page = element.querySelector(
        ".wb-page, .s-settings, .se-page, .wb-legacy-page",
      );
      if (!page?.checkVisibility()) return;
      started = true;
      observer.disconnect();
      const timing = motionTiming(element);
      // Moving this flex/overflow container caused per-frame layout in the packaged
      // Chromium runtime, even when composited. Fade the stable node on every route;
      // this also keeps the native WebContentsView aligned with its DOM bounds.
      animation = playMotion(element, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 200,
        easing: timing.out,
      });
    };
    preference.addEventListener("change", onPreference);
    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    start();
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", onPreference);
      animation?.cancel();
    };
  }, [pathname, ref]);
}
