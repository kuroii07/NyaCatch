import test from "node:test";
import assert from "node:assert/strict";
import { trustedApplicationFrame as trusted } from "./frame-policy";
test("native bridge is limited to trusted application main frames", () => {
  const app = {
    protocol: "mediago-community:",
    hostname: "index.html",
    port: "",
  };
  assert.equal(trusted(app, true, false), true);
  assert.equal(trusted(app, false, false), false);
  for (const hostname of ["index.html.evil", "www.douyin.com", "localhost"])
    assert.equal(trusted({ ...app, hostname }, true, false), false);
  assert.equal(
    trusted(
      { protocol: "https:", hostname: "www.douyin.com", port: "" },
      true,
      true,
    ),
    false,
  );
  const dev = { protocol: "http:", hostname: "localhost", port: "8555" };
  assert.equal(trusted(dev, true, true), true);
  assert.equal(trusted(dev, true, false), false);
  assert.equal(trusted({ ...dev, port: "39719" }, true, true), false);
});
