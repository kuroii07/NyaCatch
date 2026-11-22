import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProgress } from "./nc-progress-model";

test("invalid or unknown measurements never expose NaN or a false ARIA reading", () => {
  for (const max of [0, -1, Number.NaN, Infinity, 200]) {
    for (const value of [undefined, Number.NaN, Infinity, -Infinity]) {
      const progress = normalizeProgress(value, max);
      assert.equal(progress.now, undefined);
      assert.ok(Number.isFinite(progress.maximum) && progress.maximum > 0);
      assert.ok(
        Number.isFinite(progress.ratio) &&
          progress.ratio >= 0 &&
          progress.ratio <= 1,
      );
    }
  }
});

test("valid measurements clamp to their range, including invalid maximum fallback", () => {
  assert.deepEqual(normalizeProgress(250, 200), {
    maximum: 200,
    now: 200,
    ratio: 1,
  });
  assert.equal(normalizeProgress(-20, 200).now, 0);
  assert.equal(normalizeProgress(50, 200).ratio, 0.25);
  assert.deepEqual(normalizeProgress(50, 0), normalizeProgress(50, 100));
});

test("completion fills an unknown or stale measurement; pause and failure retain measured truth", () => {
  assert.equal(normalizeProgress(undefined, 10, "complete").now, 10);
  assert.equal(normalizeProgress(3, 10, "complete").ratio, 1);
  for (const state of ["paused", "failed"] as const) {
    assert.equal(normalizeProgress(3, 10, state).now, 3);
    assert.equal(normalizeProgress(undefined, 10, state).now, undefined);
  }
});
