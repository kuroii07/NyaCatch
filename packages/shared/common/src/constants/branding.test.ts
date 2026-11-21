import assert from "node:assert/strict";
import test from "node:test";
import { toWindowsFileVersion } from "./branding";

test("maps beta and stable product versions to four-part Windows versions", () => {
  assert.equal(toWindowsFileVersion("0.2.0-beta.1"), "0.2.0.1");
  assert.equal(toWindowsFileVersion("0.2.0-beta.12"), "0.2.0.12");
  assert.equal(toWindowsFileVersion("0.2.0"), "0.2.0.0");
});

test("rejects invalid or out-of-range product versions", () => {
  for (const version of [
    "0.2",
    "0.2.0-beta",
    "0.2.0-beta.0",
    "0.2.0-beta.01",
    "00.2.0",
    "65536.0.0",
  ]) {
    assert.throws(() => toWindowsFileVersion(version), version);
  }
});
