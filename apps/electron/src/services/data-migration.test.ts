import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateLegacyWorkspace } from "./data-migration";

const sqliteHeader = Buffer.from("SQLite format 3\0", "utf8");

async function createWorkspace(root: string, name: string, config: object) {
  const workspace = path.join(root, "appdata", "mediago");
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, "config.json"), JSON.stringify(config));
  await writeFile(path.join(workspace, "app.db"), sqliteHeader);
  await mkdir(path.join(workspace, "logs", "tasks"), { recursive: true });
  await writeFile(path.join(workspace, "logs", "tasks", "1.log"), name);
  await mkdir(path.join(workspace, "thumbnails"), { recursive: true });
  await writeFile(path.join(workspace, "thumbnails", "1.jpg"), name);
  return workspace;
}

test("imports an older package data folder and keeps a complete rollback copy", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nyacatch-migrate-"));
  try {
    const sourceRoot = path.join(root, "old-package", "data");
    const targetRoot = path.join(root, "new-package", "data");
    const sourceWorkspace = await createWorkspace(sourceRoot, "legacy task", {
      local: "D:/Media",
      theme: "cream",
    });
    const targetWorkspace = await createWorkspace(targetRoot, "current task", {
      local: "C:/Downloads",
      theme: "system",
    });
    await mkdir(path.join(sourceRoot, "userdata", "session"), {
      recursive: true,
    });
    await writeFile(
      path.join(sourceRoot, "userdata", "session", "Cookies"),
      "must not migrate",
    );
    await mkdir(path.join(sourceRoot, "downloads"), { recursive: true });
    await writeFile(
      path.join(sourceRoot, "downloads", "private-video.mp4"),
      "media",
    );

    const result = await migrateLegacyWorkspace(
      sourceRoot,
      targetWorkspace,
      "mediago",
    );

    assert.equal(
      await readFile(path.join(targetWorkspace, "config.json"), "utf8"),
      await readFile(path.join(sourceWorkspace, "config.json"), "utf8"),
    );
    assert.deepEqual(
      await readFile(path.join(targetWorkspace, "app.db")),
      await readFile(path.join(sourceWorkspace, "app.db")),
    );
    assert.equal(
      await readFile(
        path.join(targetWorkspace, "logs", "tasks", "1.log"),
        "utf8",
      ),
      "legacy task",
    );
    assert.equal(
      await readFile(path.join(targetWorkspace, "thumbnails", "1.jpg"), "utf8"),
      "legacy task",
    );
    assert.ok(result.backupPath);
    assert.equal(
      await readFile(path.join(result.backupPath!, "config.json"), "utf8"),
      JSON.stringify({ local: "C:/Downloads", theme: "system" }),
    );
    await assert.rejects(
      readFile(path.join(targetRoot, "userdata", "session", "Cookies")),
    );
    await assert.rejects(
      readFile(path.join(targetWorkspace, "userdata", "session", "Cookies")),
    );
    await assert.rejects(
      readFile(path.join(targetRoot, "downloads", "private-video.mp4")),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects the current workspace as its own legacy source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nyacatch-same-source-"));
  try {
    const dataRoot = path.join(root, "package", "data");
    const workspace = await createWorkspace(dataRoot, "current task", {
      theme: "cream",
    });
    await assert.rejects(
      migrateLegacyWorkspace(dataRoot, workspace, "mediago"),
      /invalid legacy workspace/i,
    );
    assert.equal(
      await readFile(path.join(workspace, "logs", "tasks", "1.log"), "utf8"),
      "current task",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runs the optional read-only database validator before staging data", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nyacatch-db-validator-"));
  try {
    const sourceRoot = path.join(root, "old", "data");
    const targetWorkspace = await createWorkspace(
      path.join(root, "new", "data"),
      "current task",
      { theme: "system" },
    );
    await createWorkspace(sourceRoot, "legacy task", { theme: "cream" });
    const dbPath = path.join(sourceRoot, "appdata", "mediago", "app.db");
    let calledWith = "";
    await assert.rejects(
      migrateLegacyWorkspace(sourceRoot, targetWorkspace, "mediago", {
        validateDatabase: async (candidate) => {
          calledWith = candidate;
          throw new Error("integrity check failed");
        },
      }),
      /integrity check failed/,
    );
    assert.equal(calledWith, dbPath);
    assert.equal(
      await readFile(
        path.join(targetWorkspace, "logs", "tasks", "1.log"),
        "utf8",
      ),
      "current task",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects invalid legacy data before changing the current workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nyacatch-invalid-"));
  try {
    const sourceRoot = path.join(root, "old", "data");
    const targetRoot = path.join(root, "new", "data");
    const targetWorkspace = await createWorkspace(targetRoot, "current task", {
      local: "C:/Downloads",
    });
    const sourceWorkspace = path.join(sourceRoot, "appdata", "mediago");
    await mkdir(sourceWorkspace, { recursive: true });
    await writeFile(path.join(sourceWorkspace, "config.json"), "not json");
    await writeFile(path.join(sourceWorkspace, "app.db"), "not sqlite");

    await assert.rejects(
      migrateLegacyWorkspace(sourceRoot, targetWorkspace, "mediago"),
      /valid legacy workspace/i,
    );
    assert.equal(
      await readFile(
        path.join(targetWorkspace, "logs", "tasks", "1.log"),
        "utf8",
      ),
      "current task",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires a readable SQLite task database in the legacy workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nyacatch-no-db-"));
  try {
    const sourceRoot = path.join(root, "old", "data");
    const targetWorkspace = await createWorkspace(
      path.join(root, "new", "data"),
      "current task",
      { theme: "system" },
    );
    const sourceWorkspace = path.join(sourceRoot, "appdata", "mediago");
    await mkdir(sourceWorkspace, { recursive: true });
    await writeFile(path.join(sourceWorkspace, "config.json"), "{}");

    await assert.rejects(
      migrateLegacyWorkspace(sourceRoot, targetWorkspace, "mediago"),
      /valid legacy workspace/i,
    );
    assert.equal(
      await readFile(
        path.join(targetWorkspace, "logs", "tasks", "1.log"),
        "utf8",
      ),
      "current task",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restores the current workspace if the staged directory cannot replace it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nyacatch-rollback-"));
  try {
    const sourceRoot = path.join(root, "old", "data");
    const targetRoot = path.join(root, "new", "data");
    await createWorkspace(sourceRoot, "legacy task", { theme: "cream" });
    const targetWorkspace = await createWorkspace(targetRoot, "current task", {
      theme: "system",
    });
    let rejectStagedSwap = true;
    await assert.rejects(
      migrateLegacyWorkspace(sourceRoot, targetWorkspace, "mediago", {
        rename: async (from, to) => {
          if (
            rejectStagedSwap &&
            to === targetWorkspace &&
            from.includes("migration-staging")
          ) {
            rejectStagedSwap = false;
            throw new Error("simulated replace failure");
          }
          await rename(from, to);
        },
      }),
      /simulated replace failure/,
    );

    assert.equal(
      await readFile(
        path.join(targetWorkspace, "logs", "tasks", "1.log"),
        "utf8",
      ),
      "current task",
    );
    const entries = await readdir(path.dirname(targetWorkspace));
    assert.equal(
      entries.filter((entry) => entry.includes("migration-staging")).length,
      0,
    );
    assert.equal(
      entries.filter((entry) => entry.includes("mediago-backup-")).length,
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("still restores the current workspace when staging cleanup fails", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "nyacatch-cleanup-rollback-"),
  );
  try {
    const sourceRoot = path.join(root, "old", "data");
    const targetRoot = path.join(root, "new", "data");
    await createWorkspace(sourceRoot, "legacy task", { theme: "cream" });
    const targetWorkspace = await createWorkspace(targetRoot, "current task", {
      theme: "system",
    });
    let rejectStagedSwap = true;
    await assert.rejects(
      migrateLegacyWorkspace(sourceRoot, targetWorkspace, "mediago", {
        rename: async (from, to) => {
          if (
            rejectStagedSwap &&
            to === targetWorkspace &&
            from.includes("migration-staging")
          ) {
            rejectStagedSwap = false;
            throw new Error("simulated replace failure");
          }
          await rename(from, to);
        },
        remove: async (target, options) => {
          if (target.includes("migration-staging")) {
            throw new Error("simulated cleanup failure");
          }
          await rm(target, options);
        },
      }),
      /simulated replace failure.*Temporary migration data could not be removed/s,
    );

    assert.equal(
      await readFile(
        path.join(targetWorkspace, "logs", "tasks", "1.log"),
        "utf8",
      ),
      "current task",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
