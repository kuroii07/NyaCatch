import assert from "node:assert/strict";
import test from "node:test";
import { unwrapIpcResult } from "./ipc-result";

test("failed IPC responses preserve their message as an Error", async () => {
  assert.throws(
    () =>
      unwrapIpcResult({
        code: -1,
        message: "Invalid legacy workspace",
        data: null,
      }),
    /Invalid legacy workspace/,
  );
});
