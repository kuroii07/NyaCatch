import { useLayoutEffect, useRef, type RefObject } from "react";
import { motionTiming, playMotion, reducedMotion } from "@/lib/motion";
import "@/components/list-motion.css";

type Item = {
  node: HTMLElement;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Flight = { animation: Animation; x: number; y: number; opacity: number };

function snapshot(item: Item) {
  const ghost = item.node.cloneNode(true) as HTMLElement;
  // cloneNode carries no React listeners. Strip identities and active content
  // before insertion, and keep the entire visual copy outside interaction/AT.
  ghost
    .querySelectorAll(
      "audio, video, iframe, object, embed, script, source, track",
    )
    .forEach((node) => node.remove());
  for (const node of [ghost, ...ghost.querySelectorAll<HTMLElement>("*")]) {
    for (const name of node.getAttributeNames()) {
      if (
        ["id", "data-testid", "data-nc-list-key", "autofocus"].includes(name) ||
        name.startsWith("on")
      ) {
        node.removeAttribute(name);
      }
    }
    node.removeAttribute("tabindex");
  }
  ghost.inert = true;
  ghost.setAttribute("aria-hidden", "true");
  ghost.classList.add("nc-list-ghost");
  Object.assign(ghost.style, {
    left: `${item.x}px`,
    top: `${item.y}px`,
    width: `${item.width}px`,
    height: `${item.height}px`,
  });
  return ghost;
}

/** A decoration layer only: React owns keys, row lifetime, and all task state. */
export function useListMotion(
  ref: RefObject<HTMLElement | null>,
  ids: readonly (string | number)[],
  contextKey: string,
) {
  const idsKey = JSON.stringify(ids.map(String));
  const sync = useRef<((keys: string, context: string) => void) | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const container = element;
    const preference = reducedMotion();
    const flights = new Map<HTMLElement, Flight>();
    const ghosts = new Map<
      string,
      { node: HTMLElement; animation: Animation }
    >();
    let items = new Map<string, Item>();
    let keys: string[] = [];
    let context: string | undefined;
    let frame = 0;
    let disposed = false;

    function visual(node: HTMLElement) {
      const flight = flights.get(node);
      if (node.isConnected) {
        const css = getComputedStyle(node);
        const transform = new DOMMatrixReadOnly(css.transform);
        return {
          x: transform.m41,
          y: transform.m42,
          opacity: Number(css.opacity),
        };
      }
      // A removed row is already detached at layout-effect time. Sample our
      // two-keyframe flight instead of reading its now-empty client rectangle.
      const progress =
        flight?.animation.effect?.getComputedTiming().progress ?? 0;
      return {
        x: (flight?.x ?? 0) * (1 - progress),
        y: (flight?.y ?? 0) * (1 - progress),
        opacity: 1 - (1 - (flight?.opacity ?? 1)) * (1 - progress),
      };
    }

    function measure() {
      const bounds = container.getBoundingClientRect();
      const allowed = new Set(keys);
      const next = new Map<string, Item>();
      for (const node of container.querySelectorAll<HTMLElement>(
        "[data-nc-list-key]",
      )) {
        const key = node.dataset.ncListKey;
        if (!key || !allowed.has(key) || !node.getClientRects().length)
          continue;
        const rect = node.getBoundingClientRect();
        const offset = visual(node);
        next.set(key, {
          node,
          x:
            rect.left -
            bounds.left +
            container.scrollLeft -
            container.clientLeft -
            offset.x,
          y:
            rect.top -
            bounds.top +
            container.scrollTop -
            container.clientTop -
            offset.y,
          width: rect.width,
          height: rect.height,
        });
      }
      return next;
    }

    function cancelFlights() {
      flights.forEach(({ animation }) => animation.cancel());
      flights.clear();
    }
    function removeGhost(key: string) {
      const ghost = ghosts.get(key);
      ghost?.animation.cancel();
      ghost?.node.remove();
      ghosts.delete(key);
    }
    function clear() {
      cancelFlights();
      for (const key of ghosts.keys()) removeGhost(key);
    }

    const resize = new ResizeObserver(() => schedule());
    function observe() {
      resize.disconnect();
      resize.observe(container);
      items.forEach(({ node }) => resize.observe(node));
    }
    function recache() {
      const next = measure();
      const changed =
        next.size !== items.size ||
        [...next].some(([key, item]) => {
          const old = items.get(key);
          return (
            !old ||
            (["x", "y", "width", "height"] as const).some(
              (axis) => Math.abs(item[axis] - old[axis]) > 0.5,
            )
          );
        });
      // Transforms don't resize the observed boxes; equal geometry is a no-op,
      // including the observer's initial notification after each ID change.
      if (changed) {
        clear();
        items = next;
      }
    }
    function schedule() {
      if (disposed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        recache();
      });
    }

    sync.current = (serialized, nextContext) => {
      const changedContext = context !== undefined && context !== nextContext;
      if (changedContext) {
        clear();
        items.clear();
      }
      context = nextContext;
      keys = JSON.parse(serialized) as string[];
      const next = measure();
      const offsets = new Map(
        [...items].map(([key, item]) => [key, visual(item.node)]),
      );
      const timing = motionTiming(container);
      const removed = [...items].filter(([key]) => !next.has(key));

      // Only removed rows are cloned, after the business DOM has unmounted.
      if (!preference.matches && !changedContext) {
        for (const [key, item] of removed) {
          const offset = offsets.get(key);
          const ghost = snapshot({
            ...item,
            x: item.x + (offset?.x ?? 0),
            y: item.y + (offset?.y ?? 0),
          });
          removeGhost(key);
          container.appendChild(ghost);
          const animation = playMotion(
            ghost,
            [{ opacity: offset?.opacity ?? 1 }, { opacity: 0 }],
            { duration: timing.reduced, easing: timing.out },
            "skip",
          );
          if (animation) {
            ghosts.set(key, { node: ghost, animation });
            animation.onfinish = () => removeGhost(key);
          } else ghost.remove();
        }
      }
      cancelFlights();
      for (const [key, item] of next) {
        removeGhost(key);
        const before = items.get(key);
        const offset = offsets.get(key);
        const x = before ? before.x + (offset?.x ?? 0) - item.x : 0;
        const y = before ? before.y + (offset?.y ?? 0) - item.y : -4;
        const opacity = before ? (offset?.opacity ?? 1) : 0;
        if (
          changedContext ||
          (before && Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && opacity >= 0.999)
        )
          continue;
        if (preference.matches && before) continue;
        const animation = playMotion(
          item.node,
          preference.matches
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { transform: `translate(${x}px, ${y}px)`, opacity },
                { transform: "translate(0, 0)", opacity: 1 },
              ],
          {
            duration: timing.base,
            delay: removed.length && !preference.matches ? timing.reduced : 0,
            easing: timing.out,
            fill: "both",
          },
        );
        if (animation) {
          flights.set(item.node, {
            animation,
            x: preference.matches ? 0 : x,
            y: preference.matches ? 0 : y,
            opacity: preference.matches ? 0.7 : opacity,
          });
          animation.onfinish = () => {
            if (flights.get(item.node)?.animation !== animation) return;
            flights.delete(item.node);
            animation.cancel();
          };
        }
      }
      items = next;
      observe();
    };

    const onPreference = () => {
      clear();
      items = measure();
    };
    preference.addEventListener("change", onPreference);
    container.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);
    document.fonts.addEventListener("loadingdone", schedule);
    return () => {
      disposed = true;
      sync.current = null;
      cancelAnimationFrame(frame);
      resize.disconnect();
      preference.removeEventListener("change", onPreference);
      container.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      document.fonts.removeEventListener("loadingdone", schedule);
      clear();
      items.clear();
    };
  }, [ref]);

  useLayoutEffect(() => {
    sync.current?.(idsKey, contextKey);
  }, [idsKey, contextKey]);
}
