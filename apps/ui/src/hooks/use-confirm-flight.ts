import { useEffect, useRef } from "react";
import { motionTiming, playMotion, reducedMotion } from "@/lib/motion";

export function useConfirmFlight() {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  return (from: DOMRect | undefined) => {
    cleanup.current?.();
    const preference = reducedMotion();
    if (
      !from ||
      preference.matches ||
      document.documentElement.dataset.ncMotion !== "full"
    )
      return;
    const recent = document.querySelector("#recent-title");
    const recentRect = recent?.getBoundingClientRect();
    const target =
      recentRect && recentRect.top >= 0 && recentRect.bottom < innerHeight
        ? recentRect
        : document
            .querySelector('.wb-sidebar a[href="/queue"]')
            ?.getBoundingClientRect();
    const brand = document.querySelector('[data-testid="brand-icon"]');
    if (!target || !brand) return;
    const ghost = document.createElement("span");
    ghost.className = "nc-confirm-flight";
    ghost.inert = true;
    ghost.setAttribute("aria-hidden", "true");
    const icon = brand.cloneNode(true) as Element;
    for (const node of [icon, ...icon.querySelectorAll("*")]) {
      node.removeAttribute("id");
      node.removeAttribute("data-testid");
    }
    ghost.appendChild(icon);
    document.body.appendChild(ghost);
    const x = target.left + target.width / 2 - 12;
    const y = target.top + target.height / 2 - 12;
    const animation = playMotion(
      ghost,
      [
        {
          transform: `translate(${from.left + from.width / 2 - 12}px, ${from.top + from.height / 2 - 12}px) scale(.96)`,
          opacity: 1,
        },
        {
          transform: `translate(${x}px, ${y - 4}px) scale(1.02)`,
          opacity: 1,
          offset: 0.85,
        },
        { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 0 },
      ],
      { duration: 320, easing: motionTiming(ghost).out },
      "skip",
    );
    const clear = () => {
      animation?.cancel();
      ghost.remove();
      preference.removeEventListener("change", clear);
      if (cleanup.current === clear) cleanup.current = null;
    };
    cleanup.current = clear;
    preference.addEventListener("change", clear);
    if (animation) void animation.finished.then(clear, clear);
    else clear();
  };
}
