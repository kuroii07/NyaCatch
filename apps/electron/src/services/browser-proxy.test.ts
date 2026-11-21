import assert from "node:assert/strict";
import test from "node:test";
import { applyBrowserProxy, browserProxyConfig } from "./browser-proxy";

test("disabled custom proxy follows the system even with a stale saved address", () => {
  for (const address of ["", "http://old.invalid:8000", "invalid old value"]) {
    assert.deepEqual(browserProxyConfig(false, address), { mode: "system" });
  }
});

test("custom browser proxies retain supported routes and remote SOCKS DNS", () => {
  for (const [address, expected] of [
    ["127.0.0.1:8000", "http://127.0.0.1:8000"],
    [" https://proxy.example:8443 ", "https://proxy.example:8443"],
    ["socks5://localhost:1080", "socks5://localhost:1080"],
    ["socks5h://localhost:1080", "socks5://localhost:1080"],
  ]) {
    assert.deepEqual(browserProxyConfig(true, address), {
      mode: "fixed_servers",
      proxyRules: expected,
    });
  }
  for (const address of ["", " ", "ftp://proxy.example:21", "http://"]) {
    assert.throws(() => browserProxyConfig(true, address));
  }
});

test("proxy application waits for configuration before releasing old connections", async () => {
  const steps: string[] = [];
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const configured = applyBrowserProxy(
    {
      setProxy: async (config) => {
        assert.deepEqual(config, { mode: "system" });
        steps.push("setting");
        await pending;
        steps.push("applied");
      },
      closeAllConnections: async () => {
        steps.push("connections-closed");
      },
    },
    { mode: "system" },
  );
  assert.deepEqual(steps, ["setting"]);
  complete();
  await configured;
  assert.deepEqual(steps, ["setting", "applied", "connections-closed"]);
});

test("failed proxy application is surfaced without claiming connections were reset", async () => {
  let closed = false;
  await assert.rejects(
    applyBrowserProxy(
      {
        setProxy: async () => {
          throw new Error("configuration rejected");
        },
        closeAllConnections: async () => {
          closed = true;
        },
      },
      { mode: "system" },
    ),
    /configuration rejected/,
  );
  assert.equal(closed, false);
});
