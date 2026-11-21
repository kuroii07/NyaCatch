import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { migrateLegacyWorkspace } from "../apps/electron/src/services/data-migration";

const root = path.resolve(import.meta.dirname, "..");
const coreExe = path.join(root, "apps/core/bin/mediago-core.exe");
const depsDir = path.join(root, ".deps/win32-x64");
const port = 40139;
const baseURL = `http://127.0.0.1:${port}`;
const temp = await mkdtemp(path.join(os.tmpdir(), "nyacatch-migration-"));
const oldData = path.join(temp, "old package", "data");
const newData = path.join(temp, "new package", "data");
const oldWorkspace = path.join(oldData, "appdata", "mediago-community");
const newWorkspace = path.join(newData, "appdata", "mediago-community");
const outputDirectory = path.join(oldData, "下载 Media");
const outputPath = path.join(outputDirectory, "existing video.mp4");
let core: ChildProcess | undefined;

async function waitForCore() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`${baseURL}/healthy`);
      if (response.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error("Isolated MediaGo core did not start");
}

async function stopCore() {
  if (!core || core.exitCode !== null) return;
  const processToStop = core;
  core = undefined;
  processToStop.kill();
  await Promise.race([
    new Promise<void>((resolve) => processToStop.once("exit", () => resolve())),
    delay(5000).then(() => {
      throw new Error("Isolated MediaGo core did not stop");
    }),
  ]);
}

async function startCore(configRoot: string) {
  const logs = path.join(configRoot, "logs");
  const children = spawn(
    coreExe,
    [
      `-port=${port}`,
      `-log-dir=${logs}`,
      `-config-dir=${configRoot}`,
      `-db-path=${path.join(configRoot, "app.db")}`,
      `-deps-dir=${depsDir}`,
    ],
    {
      cwd: root,
      env: { ...process.env, HOST: "127.0.0.1", GIN_MODE: "release" },
      windowsHide: true,
      stdio: "ignore",
    },
  );
  core = children;
  children.once("exit", (code) => {
    if (code !== null && code !== 0) {
      throw new Error(`Isolated MediaGo core exited with code ${code}`);
    }
  });
  await waitForCore();
  await updateConfig({
    local: outputDirectory,
    language: "ja",
    theme: "cream",
  });
}

async function getJSON(route: string) {
  const response = await fetch(`${baseURL}${route}`);
  assert.ok(response.ok, `GET ${route} failed: ${response.status}`);
  return response.json();
}

async function updateConfig(values: Record<string, unknown>) {
  const response = await fetch(`${baseURL}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  const result = await response.json();
  assert.equal(result.success, true, JSON.stringify(result));
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, "old media remains at its original location");
  await mkdir(path.join(oldData, "userdata", "session"), { recursive: true });
  await writeFile(
    path.join(oldData, "userdata", "session", "Cookies"),
    "not copied",
  );
  await startCore(oldWorkspace);

  const createdResponse = await fetch(`${baseURL}/api/downloads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tasks: [
        {
          name: "existing video.mp4",
          type: "youtube-single",
          url: "https://example.test/watch?v=fixture",
          options: {
            version: 1,
            mode: "video",
            saveDir: outputDirectory,
            audioFormat: "original",
          },
        },
      ],
      startDownload: false,
    }),
  });
  const created = await createdResponse.json();
  assert.equal(created.success, true, JSON.stringify(created));
  const taskId = created.data[0].id;
  const taskResult = await getJSON(`/api/downloads/${taskId}`);
  assert.equal(taskResult.data.options.saveDir, outputDirectory);
  await stopCore();

  const migration = await migrateLegacyWorkspace(
    oldData,
    newWorkspace,
    "mediago-community",
  );
  assert.ok(migration.backupPath === null || migration.backupPath.length > 0);

  await startCore(newWorkspace);
  const config = await getJSON("/api/config");
  const restored = await getJSON(`/api/downloads/${taskId}`);
  assert.equal(config.data.language, "ja");
  assert.equal(config.data.theme, "cream");
  assert.equal(config.data.local, outputDirectory);
  assert.equal(restored.data.options.saveDir, outputDirectory);
  assert.equal(restored.data.url, "https://example.test/watch?v=fixture");
  assert.equal(
    await readFile(outputPath, "utf8"),
    "old media remains at its original location",
  );
  await assert.rejects(
    readFile(path.join(newData, "userdata", "session", "Cookies")),
  );
  await stopCore();

  const report = {
    passed: true,
    preservedConfig: true,
    preservedTaskAndOutputPath: true,
    downloadedMediaCopied: false,
    browserSessionCopied: false,
  };
  console.log(JSON.stringify(report, null, 2));
  const outputs = path.resolve(root, "../..", "outputs");
  await mkdir(outputs, { recursive: true });
  await writeFile(
    path.join(outputs, "0.2.0-data-migration-smoke.json"),
    JSON.stringify(report, null, 2),
  );
}

try {
  await main();
} finally {
  await stopCore().catch(() => undefined);
  await rm(temp, { recursive: true, force: true });
}
