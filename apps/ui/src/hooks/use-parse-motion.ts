import { useLayoutEffect, useRef, type RefObject } from "react";
import { motionTiming, playMotion, reducedMotion } from "@/lib/motion";

/** The resolver owns state; these animations never delay a result or cancellation. */
export function useParseMotion(
  workspace: RefObject<HTMLElement | null>,
  result: object | null,
  error: string,
) {
  const previous = useRef(result);
  const errorElement = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = workspace.current;
    const changed = previous.current !== result;
    previous.current = result;
    if (!changed || !result || !element) return;
    const preference = reducedMotion();
    const timing = motionTiming(element);
    const animations = [
      ...element.querySelectorAll<HTMLElement>(":scope > section"),
    ].map((card, index) =>
      playMotion(
        card,
        // Grid cards have the same overflow-layout cost as the route flex item.
        // Keep the stagger, but fade without repeatedly invalidating geometry.
        [{ opacity: 0 }, { opacity: 1 }],
        {
          duration: timing.base,
          delay: index * 60,
          easing: timing.out,
          fill: "backwards",
        },
      ),
    );
    const clear = () => animations.forEach((animation) => animation?.cancel());
    preference.addEventListener("change", clear);
    return () => {
      clear();
      preference.removeEventListener("change", clear);
    };
  }, [result, workspace]);

  useLayoutEffect(() => {
    const element = errorElement.current;
    if (!error || !element) return;
    const preference = reducedMotion();
    const animation = playMotion(
      element,
      [
        { transform: "none" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(3px)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(3px)" },
        { transform: "none" },
      ],
      { duration: 240, easing: motionTiming(element).out },
    );
    const clear = () => animation?.cancel();
    preference.addEventListener("change", clear);
    return () => {
      clear();
      preference.removeEventListener("change", clear);
    };
  }, [error]);
  return errorElement;
}
