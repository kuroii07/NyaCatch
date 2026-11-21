import test from "node:test";
import assert from "node:assert/strict";
import {
  UPDATE_REPOSITORY,
  assertIdleStatuses,
  stableUpdateAllowed,
} from "./update-policy";
test("only installed stable builds use the NyaCatch update channel", () => {
  assert.deepEqual(UPDATE_REPOSITORY, {
    provider: "github",
    owner: "kuroii07",
    repo: "NyaCatch",
  });
  assert.equal(stableUpdateAllowed(true, "stable", true), true);
  for (const input of [
    [false, "stable", true],
    [true, "local-beta", true],
    [true, "stable", false],
    [true, undefined, true],
  ] as const) {
    assert.equal(stableUpdateAllowed(...input), false);
  }
});
test("install protects active and unknown task states", () => {
  assert.doesNotThrow(() =>
    assertIdleStatuses(
      ["ready", "success", "done", "stopped", "failed", "cancelled"].map(
        (status) => ({ status }),
      ),
    ),
  );
  for (const status of [
    "pending",
    "downloading",
    "converting",
    "",
    "unknown",
    "paused",
  ]) {
    assert.throws(() => assertIdleStatuses([{ status }]), /suBusy/);
  }
});
