import test from "node:test";
import assert from "node:assert/strict";
import { selectTaskIds, canStart, canRemove } from "./task-selection";
test("Windows row selection preserves Ctrl, Shift and anchor order", () => {
  const ids = [5, 4, 3, 2];
  assert.deepEqual(selectTaskIds([5], ids, 3, {}, 5), [3]);
  assert.deepEqual(selectTaskIds([5], ids, 3, { ctrlKey: true }, 5), [5, 3]);
  assert.deepEqual(selectTaskIds([5, 3], ids, 3, { ctrlKey: true }, 5), [5]);
  assert.deepEqual(
    selectTaskIds([5], ids, 2, { shiftKey: true }, 5),
    [5, 4, 3, 2],
  );
  assert.deepEqual(
    selectTaskIds([5], ids, 2, { ctrlKey: true, shiftKey: true }, 3),
    [5, 3, 2],
  );
});
test("only suitable task states can start or be removed", () => {
  for (const status of ["ready", "stopped", "failed"])
    assert.equal(canStart(status), true);
  for (const status of ["downloading", "pending", "success"])
    assert.equal(canStart(status), false);
  assert.equal(canRemove("pending"), false);
  assert.equal(canRemove("downloading"), false);
  assert.equal(canRemove("success"), true);
});
