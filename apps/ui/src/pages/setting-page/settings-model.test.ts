import test from "node:test";
import assert from "node:assert/strict";
import { changes, reconcile, snapshot } from "./settings-model";
import {
  saveSettings,
  useSettingsWorkspace as workspace,
} from "./settings-workspace";
import { settingsMaintenanceMessages } from "../../i18n/settings-maintenance";

test("draft rebases untouched fields and keeps conflicting edits", () => {
  const entry = {
    base: { proxy: "http://old", useProxy: false },
    values: { proxy: "http://mine", useProxy: false },
    conflict: false,
  };
  const next = reconcile(entry, { proxy: "http://external", useProxy: true });
  assert.deepEqual(next.values, { proxy: "http://mine", useProxy: true });
  assert.equal(next.conflict, true);
  assert.deepEqual(changes(next.base, next.values), { proxy: "http://mine" });
  assert.deepEqual(changes(next.values, next.values), {});
});
test("memory drafts retain secrets without storage and reset to current", () => {
  workspace
    .getState()
    .sync("remote", { dockerUrl: "", apiKey: "", enableDocker: false });
  workspace.getState().edit("remote", { apiKey: "synthetic-secret" });
  workspace.getState().sync("remote", {
    dockerUrl: "https://new",
    apiKey: "",
    enableDocker: false,
  });
  assert.equal(
    workspace.getState().drafts.remote?.values.apiKey,
    "synthetic-secret",
  );
  assert.equal(
    workspace.getState().drafts.remote?.values.dockerUrl,
    "https://new",
  );
  workspace.getState().reset("remote", { apiKey: "" });
  assert.equal(workspace.getState().drafts.remote?.values.apiKey, "");
  assert.deepEqual(snapshot("proxy", { proxy: "x", apiKey: "secret" }), {
    proxy: "x",
    useProxy: undefined,
    downloadProxySwitch: undefined,
  });
});
test("lost save response is confirmed by read; failed target survives for explicit retry", async () => {
  const target = { proxy: "http://new" };
  let actual = { proxy: "http://old" };
  const update = (next: typeof target) => {
    actual = next;
  };
  assert.equal(
    await saveSettings(
      target,
      async () => {
        throw Error("lost");
      },
      async () => target,
      update,
    ),
    true,
  );
  assert.equal(workspace.getState().saveState, "saved");
  assert.equal(
    await saveSettings(
      { proxy: "http://retry" },
      async () => {
        throw Error("io");
      },
      async () => actual,
      update,
    ),
    false,
  );
  assert.deepEqual(workspace.getState().retry, { proxy: "http://retry" });
  assert.equal(workspace.getState().saveState, "failed");
  assert.equal(
    await saveSettings(
      workspace.getState().retry ?? {},
      async () => {},
      async () => actual,
      update,
    ),
    true,
  );
  assert.equal(actual.proxy, "http://retry");
  assert.equal(workspace.getState().retry, undefined);
});
test("concurrent save is rejected until the pending request settles", async () => {
  let finish!: () => void;
  const blocked = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const first = saveSettings(
    { local: "one" },
    () => blocked,
    async () => ({}),
    () => {},
  );
  assert.equal(
    await saveSettings(
      { local: "two" },
      async () => assert.fail("duplicate write"),
      async () => ({}),
      () => {},
    ),
    false,
  );
  finish();
  assert.equal(await first, true);
  assert.equal(workspace.getState().saving, false);
});
test("five maintenance locales have all keys and interpolation", () => {
  const keys = Object.keys(settingsMaintenanceMessages.zh).sort();
  for (const lang of ["zh", "zh-TW", "en", "ja", "ko"] as const) {
    assert.deepEqual(
      Object.keys(settingsMaintenanceMessages[lang]).sort(),
      keys,
    );
    for (const key of keys) {
      assert.ok(settingsMaintenanceMessages[lang][key].trim());
      assert.deepEqual(
        settingsMaintenanceMessages[lang][key].match(/\{\{\w+\}\}/g),
        settingsMaintenanceMessages.zh[key].match(/\{\{\w+\}\}/g),
      );
    }
  }
});

test("editing or resetting a failed draft invalidates its stale retry target", () => {
  workspace.getState().sync("proxy", { proxy: "http://saved" });
  workspace.setState({
    retry: { proxy: "http://failed", promptTone: true },
    saveState: "failed",
  });
  workspace.getState().edit("proxy", { proxy: "http://new-edit" });
  assert.deepEqual(workspace.getState().retry, { promptTone: true });
  workspace.setState({
    retry: { proxy: "http://failed" },
    saveState: "failed",
  });
  workspace.getState().reset("proxy", { proxy: "http://saved" });
  assert.equal(workspace.getState().retry, undefined);
  assert.equal(workspace.getState().saveState, "saved");
});

test("an externally confirmed draft clears the conflict warning", () => {
  const current = { proxy: "http://mine" };
  const result = reconcile(
    { base: { proxy: "http://old" }, values: current, conflict: true },
    current,
  );
  assert.equal(result.conflict, false);
  assert.deepEqual(changes(result.base, result.values), {});
});
