import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename as fsRename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");
const ALLOWED_FILES = ["config.json", "app.db", "app.db-shm", "app.db-wal"];
const ALLOWED_DIRECTORIES = [["logs", "tasks"], ["thumbnails"]];

export interface MigrationResult {
  backupPath: string | null;
  sourceWorkspace: string;
  targetWorkspace: string;
}

export interface MigrationDependencies {
  rename?: (from: string, to: string) => Promise<void>;
  remove?: (
    target: string,
    options: { recursive: boolean; force: boolean },
  ) => Promise<void>;
  validateDatabase?: (dbPath: string) => Promise<void>;
}

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly workspaceRestored: boolean,
    readonly backupPath: string | null = null,
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function validateAppName(appName: string): void {
  if (
    !appName ||
    path.basename(appName) !== appName ||
    appName === "." ||
    appName === ".."
  ) {
    throw new Error("Invalid application data directory name");
  }
}

export async function validateLegacyWorkspace(
  sourceDataRoot: string,
  appName: string,
  validateDatabase?: (dbPath: string) => Promise<void>,
): Promise<string> {
  validateAppName(appName);
  const sourceWorkspace = path.join(sourceDataRoot, "appdata", appName);
  const sourceInfo = await lstat(sourceWorkspace).catch(() => null);
  if (!sourceInfo?.isDirectory() || sourceInfo.isSymbolicLink()) {
    throw new Error(
      "Invalid legacy workspace: select an older NyaCatch data folder",
    );
  }

  const configPath = path.join(sourceWorkspace, "config.json");
  let parsed: unknown;
  try {
    const info = await lstat(configPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("not a file");
    parsed = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    throw new Error("Invalid legacy workspace: config.json is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid legacy workspace: config.json must be an object");
  }

  const dbPath = path.join(sourceWorkspace, "app.db");
  const dbInfo = await lstat(dbPath).catch(() => null);
  if (!dbInfo?.isFile() || dbInfo.isSymbolicLink())
    throw new Error(
      "Invalid legacy workspace: app.db is missing or not a file",
    );
  const header = (await readFile(dbPath)).subarray(0, SQLITE_HEADER.length);
  if (!header.equals(SQLITE_HEADER)) {
    throw new Error("Invalid legacy workspace: app.db is not SQLite");
  }
  if (validateDatabase) await validateDatabase(dbPath);
  return sourceWorkspace;
}

async function copySafe(source: string, destination: string): Promise<void> {
  const info = await lstat(source);
  if (info.isSymbolicLink()) {
    throw new Error("Legacy workspace contains a symbolic link");
  }
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source)) {
      await copySafe(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }
  if (!info.isFile()) {
    throw new Error("Legacy workspace contains an unsupported file type");
  }
  await copyFile(source, destination);
}

async function copyAllowlist(sourceWorkspace: string, stagingPath: string) {
  await mkdir(stagingPath, { recursive: true });
  for (const filename of ALLOWED_FILES) {
    const source = path.join(sourceWorkspace, filename);
    if (await exists(source))
      await copySafe(source, path.join(stagingPath, filename));
  }
  for (const directories of ALLOWED_DIRECTORIES) {
    const [sourceDir, ...relativeDirectories] = directories;
    const source = path.join(sourceWorkspace, ...directories);
    if (await exists(source))
      await copySafe(
        source,
        path.join(stagingPath, sourceDir, ...relativeDirectories),
      );
  }
}

export async function migrateLegacyWorkspace(
  sourceDataRoot: string,
  targetWorkspace: string,
  appName: string,
  dependencies: MigrationDependencies = {},
): Promise<MigrationResult> {
  const sourceWorkspace = await validateLegacyWorkspace(
    sourceDataRoot,
    appName,
    dependencies.validateDatabase,
  );
  const rename = dependencies.rename || fsRename;
  const remove = dependencies.remove || rm;
  if (path.resolve(sourceWorkspace) === path.resolve(targetWorkspace)) {
    throw new Error(
      "Invalid legacy workspace: select an older NyaCatch data folder",
    );
  }

  const parent = path.dirname(targetWorkspace);
  await mkdir(parent, { recursive: true });
  const targetInfo = await lstat(targetWorkspace).catch(() => null);
  if (
    targetInfo?.isSymbolicLink() ||
    (targetInfo && !targetInfo.isDirectory())
  ) {
    throw new Error("Current workspace is not a regular directory");
  }
  const token = randomUUID().replace(/-/g, "");
  const stagingPath = path.join(parent, `.migration-staging-${token}`);
  const backupPath = path.join(
    parent,
    `${appName}-backup-${Date.now()}-${token}`,
  );
  let targetMoved = false;
  let backupCreated = false;

  try {
    await copyAllowlist(sourceWorkspace, stagingPath);
    if (await exists(targetWorkspace)) {
      await rename(targetWorkspace, backupPath);
      targetMoved = true;
      backupCreated = true;
    }
    await rename(stagingPath, targetWorkspace);
    return {
      backupPath: backupCreated ? backupPath : null,
      sourceWorkspace,
      targetWorkspace,
    };
  } catch (error) {
    let cleanupError: unknown = null;
    try {
      await remove(stagingPath, { recursive: true, force: true });
    } catch (stagingCleanupError) {
      cleanupError = stagingCleanupError;
    }
    if (targetMoved) {
      try {
        await remove(targetWorkspace, { recursive: true, force: true });
      } catch {
        // Continue to the backup restore attempt. A failed staging cleanup
        // or target cleanup must not prevent the recovery path.
      }
      try {
        await rename(backupPath, targetWorkspace);
      } catch (rollbackError) {
        throw new MigrationError(
          `Migration failed and current data could not be restored. Backup remains at ${backupPath}. ${String(rollbackError)}`,
          false,
          backupPath,
        );
      }
    }
    if (cleanupError) {
      throw new MigrationError(
        `${String(error)} Temporary migration data could not be removed: ${String(cleanupError)}`,
        true,
        backupCreated ? backupPath : null,
      );
    }
    throw error;
  }
}
