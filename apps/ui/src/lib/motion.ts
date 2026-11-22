export function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

export function motionTiming(element: Element) {
  const css = getComputedStyle(element);
  const time = (name: string, fallback: number) => {
    const raw = css.getPropertyValue(`--nc-dur-${name}`).trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value)
      ? value * (raw.endsWith("ms") ? 1 : 1000)
      : fallback;
  };
  return {
    base: time("base", 220),
    fast: time("fast", 140),
    reduced: time("reduced", 120),
    out: css.getPropertyValue("--nc-ease-out").trim() || "ease-out",
    pounce: css.getPropertyValue("--nc-ease-pounce").trim() || "ease-out",
  };
}

/** Keep animations decorative: a missing animation API never blocks an action. */
export function playMotion(
  element: Element,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
  reduced: "fade" | "skip" = "fade",
) {
  if (typeof element.animate !== "function") return null;
  const preference = reducedMotion();
  if (preference.matches && reduced === "skip") return null;
  const animation = element.animate(
    preference.matches ? [{ opacity: 0.7 }, { opacity: 1 }] : frames,
    preference.matches
      ? { duration: motionTiming(element).reduced, easing: "ease-out" }
      : options,
  );
  void animation.finished.catch(() => {});
  return animation;
}
