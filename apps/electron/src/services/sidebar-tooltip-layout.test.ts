import assert from "node:assert/strict";
import test from "node:test";
import {
  sidebarTooltipBounds,
  validateSidebarTooltip,
} from "./sidebar-tooltip-layout";

const request = {
  text: "已完成",
  anchor: { x: 20, y: 100, width: 48, height: 48 },
  background: "#242a36",
  color: "#fff",
  fontSize: 14,
};

test("sidebar tooltip accepts bounded text and layout without executable markup handling", () => {
  assert.deepEqual(validateSidebarTooltip(request), request);
  assert.equal(validateSidebarTooltip(null), null);
  assert.equal(
    validateSidebarTooltip({ ...request, text: "<img src=x onerror=alert(1)>" })
      ?.text,
    "<img src=x onerror=alert(1)>",
  );
  for (const value of [
    undefined,
    {},
    { ...request, text: "" },
    { ...request, text: "x".repeat(161) },
    { ...request, anchor: { ...request.anchor, x: NaN } },
    { ...request, anchor: { ...request.anchor, width: -1 } },
    { ...request, background: "url(https://example.com)" },
    { ...request, fontSize: 100 },
  ])
    assert.throws(() => validateSidebarTooltip(value));
});

test("sidebar tooltip is centered beside its anchor in screen DIP coordinates", () => {
  assert.deepEqual(
    sidebarTooltipBounds(
      request.anchor,
      { x: 100, y: 50, width: 1000, height: 700 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      { width: 100, height: 40 },
    ),
    { x: 172, y: 154, width: 100, height: 40 },
  );
  assert.equal(
    sidebarTooltipBounds(
      request.anchor,
      { x: 100, y: 50, width: 1000, height: 700 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      { width: 100, height: 40 },
      1.25,
    ).x,
    189,
  );
});

test("sidebar tooltip remains within negative-coordinate monitors and bottom edges", () => {
  const bounds = sidebarTooltipBounds(
    { x: 20, y: 700, width: 48, height: 48 },
    { x: -200, y: 100, width: 760, height: 900 },
    { x: -1280, y: 0, width: 1280, height: 800 },
    { width: 200, height: 80 },
  );
  assert.equal(bounds.x, -202);
  assert.equal(bounds.y, 718);
  assert.ok(bounds.x >= -1280 && bounds.x + bounds.width <= 0);
  assert.ok(bounds.y + bounds.height <= 800);
});
