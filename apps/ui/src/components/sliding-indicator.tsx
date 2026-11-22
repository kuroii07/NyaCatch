import { useLayoutEffect, useRef } from "react";
import "./sliding-indicator.css";

const selectedButton =
  ':scope > button:is([aria-selected="true"], [aria-checked="true"], [aria-pressed="true"])';

type Box = { x: number; y: number; width: number; height: number };

/** Decoration only: the existing controls keep their semantics and input handling. */
export function SlidingIndicator({
  activeKey,
  variant = "pill",
}: {
  activeKey: string | number | boolean;
  variant?: "pill" | "underline";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const update = useRef<((animate: boolean) => void) | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const indicator = node;
    const container = parent;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    let box: Box | undefined;
    let frame = 0;
    let disposed = false;
    let forceStatic = false;

    function refresh(animate: boolean, force = false) {
      if (disposed) return;
      const button = container.querySelector<HTMLButtonElement>(selectedButton);
      const style = button && getComputedStyle(button);
      if (
        !button ||
        button.matches(':disabled, [aria-disabled="true"]') ||
        button.closest("[hidden], [inert]") ||
        !button.getClientRects().length ||
        style?.visibility === "hidden" ||
        style?.visibility === "collapse" ||
        style?.opacity === "0"
      ) {
        animation?.cancel();
        animation = undefined;
        box = undefined;
        indicator.style.opacity = "0";
        indicator.removeAttribute("data-ready");
        return;
      }

      // The positioned parent is the offsetParent. Layout offsets use its padding
      // edge (exclude borders), remain correct when scrolled, and ignore button
      // press transforms. The decoration scrolls in the same coordinate space.
      const next: Box = {
        x: button.offsetLeft,
        y:
          button.offsetTop +
          (variant === "underline" ? button.offsetHeight - 2 : 0),
        width: button.offsetWidth,
        height: variant === "underline" ? 3 : button.offsetHeight,
      };
      if (next.width <= 0 || next.height <= 0) {
        animation?.cancel();
        animation = undefined;
        box = undefined;
        indicator.style.opacity = "0";
        indicator.removeAttribute("data-ready");
        return;
      }
      const same =
        box &&
        next.x === box.x &&
        next.y === box.y &&
        next.width === box.width &&
        next.height === box.height;
      // ResizeObserver's initial notification and our own writes must not stop
      // an in-flight switch or create a resize/write feedback loop.
      if (same && !force) return;

      const previous = box;
      const visual = getComputedStyle(indicator);
      const matrix = new DOMMatrixReadOnly(visual.transform);
      const from: Box = {
        x: matrix.m41,
        y: matrix.m42,
        width: parseFloat(visual.width) * matrix.m11,
        height: parseFloat(visual.height) * matrix.m22,
      };
      animation?.cancel();
      animation = undefined;
      box = next;
      const target = `translate(${next.x}px, ${next.y}px) scale(1, 1)`;
      // Write target dimensions once; only transform/opacity animate via FLIP.
      indicator.style.width = `${next.width}px`;
      indicator.style.height = `${next.height}px`;
      indicator.style.transform = target;
      indicator.style.opacity = "1";
      indicator.setAttribute("data-ready", "");

      if (!animate || !previous || preference.matches || same) return;
      const tokens = getComputedStyle(container);
      const durationToken = tokens.getPropertyValue("--nc-dur-base").trim();
      const duration =
        parseFloat(durationToken) * (durationToken.endsWith("ms") ? 1 : 1000) ||
        220;
      const out = tokens.getPropertyValue("--nc-ease-out").trim() || "ease-out";
      const pounce =
        tokens.getPropertyValue("--nc-ease-pounce").trim() ||
        "cubic-bezier(0.34, 1.56, 0.64, 1)";
      animation = indicator.animate(
        [
          {
            transform: `translate(${from.x}px, ${from.y}px) scale(${from.width / next.width}, ${from.height / next.height})`,
            opacity: 1,
            easing: out,
          },
          {
            offset: 0.8,
            transform: `translate(${next.x}px, ${next.y}px) scale(1.025, 1)`,
            opacity: 1,
            // Confine pounce to the small stretch: long jumps never overshoot.
            easing: pounce,
          },
          { transform: target, opacity: 1 },
        ],
        { duration, easing: "linear" },
      );
    }

    function schedule(force = false) {
      if (disposed) return;
      forceStatic ||= force;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const forced = forceStatic;
        forceStatic = false;
        refresh(false, forced);
      });
    }

    const resize = new ResizeObserver(() => schedule());
    function observeButtons() {
      resize.disconnect();
      resize.observe(container);
      container
        .querySelectorAll(":scope > button")
        .forEach((button) => resize.observe(button));
    }
    const mutations = new MutationObserver((records) => {
      const changes = records.filter((record) => record.target !== indicator);
      if (!changes.length) return;
      if (changes.some((record) => record.type === "childList"))
        observeButtons();
      schedule(changes.some((record) => record.type !== "attributes"));
    });
    mutations.observe(container, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "disabled",
        "hidden",
        "inert",
        "class",
        "style",
        "aria-disabled",
        "aria-selected",
        "aria-checked",
        "aria-pressed",
      ],
    });
    const ancestors = new MutationObserver(() => schedule(true));
    for (
      let element: HTMLElement | null = container;
      element;
      element = element.parentElement
    ) {
      ancestors.observe(element, {
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "inert", "lang", "dir"],
      });
    }
    const staticRefresh = () => refresh(false, true);
    const fontsChanged = () => schedule(true);
    preference.addEventListener("change", staticRefresh);
    document.fonts.addEventListener("loadingdone", fontsChanged);
    void document.fonts.ready.then(() => {
      if (!disposed) schedule(true);
    });
    window.addEventListener("resize", fontsChanged);
    observeButtons();
    update.current = (animate) => refresh(animate);
    refresh(false);

    return () => {
      disposed = true;
      update.current = null;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      ancestors.disconnect();
      preference.removeEventListener("change", staticRefresh);
      document.fonts.removeEventListener("loadingdone", fontsChanged);
      window.removeEventListener("resize", fontsChanged);
      animation?.cancel();
      indicator.removeAttribute("data-ready");
    };
  }, [variant]);

  useLayoutEffect(() => {
    update.current?.(true);
  }, [activeKey]);

  return (
    <span
      ref={ref}
      className={`nc-sliding-indicator nc-sliding-indicator--${variant}`}
      aria-hidden="true"
    />
  );
}
