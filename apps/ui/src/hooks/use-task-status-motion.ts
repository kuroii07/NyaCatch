import { useLayoutEffect, useRef, type RefObject } from "react";
import { motionTiming, playMotion, reducedMotion } from "@/lib/motion";

/** Observe facts only; a newly mounted/reused row establishes a fresh baseline. */
export function useTaskStatusMotion(
  ref: RefObject<HTMLElement | null>,
  status: string,
  identity?: string | number,
  shake = true,
) {
  const previous = useRef({ identity, status });
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { identity, status };
    const node = ref.current;
    if (!node || before.identity !== identity || before.status === status)
      return;
    const preference = reducedMotion();
    const enabled = () =>
      document.documentElement.dataset.ncMotion === "full" &&
      !preference.matches;
    if (!enabled()) return;
    const animations: Animation[] = [];
    const cancel = () => animations.forEach((animation) => animation.cancel());
    const animate = (
      element: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      const animation = playMotion(element, frames, options, "skip");
      if (animation) animations.push(animation);
    };
    if (["success", "done", "complete"].includes(status)) {
      const check = node.querySelector<SVGSVGElement>("[data-nc-completion]");
      if (check) {
        const timing = motionTiming(node);
        animate(
          check,
          [
            { transform: "scale(0.98)", opacity: 0.6 },
            { transform: "scale(1.04)", opacity: 1, offset: 0.6 },
            { transform: "scale(1)", opacity: 1 },
          ],
          { duration: timing.base, easing: timing.out },
        );
        check
          .querySelectorAll<SVGGeometryElement>("path, polyline")
          .forEach((path) => {
            // BrandCheck uses pathLength="1"; dash units must use that same
            // normalized range rather than the physical SVG path length.
            const length =
              path.pathLength.baseVal > 0
                ? path.pathLength.baseVal
                : path.getTotalLength();
            if (length > 0)
              animate(
                path,
                [
                  { strokeDasharray: `${length}`, strokeDashoffset: length },
                  { strokeDasharray: `${length}`, strokeDashoffset: 0 },
                ],
                { duration: timing.base, easing: timing.out },
              );
          });
      }
    } else if (status === "failed" && shake) {
      // Move individual CSS translate, leaving an in-flight list FLIP transform intact.
      animate(
        node,
        [
          { translate: "0px" },
          { translate: "-3px" },
          { translate: "3px" },
          { translate: "-3px" },
          { translate: "3px" },
          { translate: "0px" },
        ],
        { duration: 240, easing: "linear" },
      );
    }
    if (!animations.length) return;
    const cleanup = () => {
      preference.removeEventListener("change", cleanup);
      gate.disconnect();
      cancel();
    };
    const gate = new MutationObserver(() => {
      if (!enabled()) cleanup();
    });
    preference.addEventListener("change", cleanup);
    gate.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-nc-motion"],
    });
    animations.forEach((animation) => {
      animation.onfinish = () => {
        if (animations.every((item) => item.playState === "finished"))
          cleanup();
      };
    });
    return cleanup;
  }, [identity, ref, shake, status]);
}
