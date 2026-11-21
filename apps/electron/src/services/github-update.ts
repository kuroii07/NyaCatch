import { provide } from "@inversifyjs/binding-decorators";
import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { inject, injectable } from "inversify";
import { mkdir, copyFile, lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { AppUpdateState } from "@mediago/shared-common";
import { dataRoot, isInstalledBuild, runtimeBuild } from "../runtime-paths";
import { db, logDir, workspace } from "../constants";
import { DownloaderServer } from "./downloader.server";
import {
  assertIdleStatuses,
  stableUpdateAllowed,
  UPDATE_REPOSITORY,
} from "./update-policy";
import GoConfigCache from "./go-config-cache";
import MainWindow from "../windows/main.window";
import ElectronLogger from "../vendor/ElectronLogger";

@injectable()
@provide()
export default class UpdateService {
  readonly enabled = stableUpdateAllowed(
    app.isPackaged,
    runtimeBuild.channel,
    isInstalledBuild,
  );
  state: AppUpdateState = {
    status: "idle",
    enabled: this.enabled,
    installed: isInstalledBuild,
  };
  private initialized = false;
  private installing = false;
  private coreStopped = false;
  private restoring?: Promise<void>;
  constructor(
    @inject(ElectronLogger) private readonly logger: ElectronLogger,
    @inject(GoConfigCache) private readonly configCache: GoConfigCache,
    @inject(MainWindow) private readonly mainWindow: MainWindow,
    @inject(DownloaderServer) private readonly server: DownloaderServer,
  ) {}

  private publish(update: Partial<AppUpdateState>) {
    this.state = { ...this.state, ...update };
    this.mainWindow.send("update:state", this.state);
  }

  async init() {
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.autoDownload = false;
    if (!this.enabled || this.initialized) return;
    this.initialized = true;
    autoUpdater.setFeedURL(UPDATE_REPOSITORY);
    autoUpdater.disableWebInstaller = true;
    autoUpdater.allowPrerelease = this.configCache.get("allowBeta");
    autoUpdater.logger = this.logger.logger;
    autoUpdater.on("checking-for-update", () =>
      this.publish({ status: "checking", error: undefined }),
    );
    autoUpdater.on("update-available", (info) =>
      this.publish({ status: "available", version: info.version }),
    );
    autoUpdater.on("update-not-available", () =>
      this.publish({ status: "current", version: undefined }),
    );
    autoUpdater.on("download-progress", (info) =>
      this.publish({
        status: "downloading",
        progress: Math.round(info.percent),
      }),
    );
    autoUpdater.on("update-downloaded", (info) =>
      this.publish({
        status: "downloaded",
        progress: 100,
        version: info.version,
      }),
    );
    autoUpdater.on("error", () => {
      if (this.installing && this.coreStopped) {
        this.publish({ status: "downloaded", error: "suBackupFailed" });
        void this.restoreCore().catch(() =>
          this.publish({ status: "error", error: "suBackupFailed" }),
        );
      } else this.publish({ status: "error", error: "suCheckFailed" });
    });
    const timer = setTimeout(() => {
      void this.manualUpdate();
    }, 60000);
    timer.unref();
  }

  async changeAllowBeta(value: boolean) {
    autoUpdater.allowPrerelease = value;
  }

  async manualUpdate() {
    if (
      !this.enabled ||
      this.installing ||
      ["checking", "downloading", "downloaded"].includes(this.state.status)
    )
      return;
    autoUpdater.autoDownload = this.configCache.get("autoUpgrade");
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      this.publish({ status: "error", error: "suCheckFailed" });
    }
  }

  async startDownload() {
    if (!this.enabled || this.state.status !== "available")
      throw new Error("suNotReady");
    this.publish({ status: "downloading", progress: 0, error: undefined });
    try {
      await autoUpdater.downloadUpdate();
    } catch {
      this.publish({ status: "error", error: "suDownloadFailed" });
    }
  }

  async assertIdle() {
    const client = this.server.getClient();
    for (const fetchPage of [
      (current: number) => client.getDownloadTasks({ current, pageSize: 100 }),
      (current: number) => client.getConversions({ current, pageSize: 100 }),
    ]) {
      let checked = 0;
      for (let current = 1; current <= 1000; current++) {
        const response = await fetchPage(current);
        if (
          !response.success ||
          !Array.isArray(response.data.list) ||
          !Number.isFinite(response.data.total)
        )
          throw new Error("suBusy");
        assertIdleStatuses(response.data.list);
        checked += response.data.list.length;
        if (checked >= response.data.total) break;
        if (!response.data.list.length || current === 1000)
          throw new Error("suBusy");
      }
    }
    const url = await this.server.getURL();
    const response = await fetch(`${url}/api/conversions/preview-cache`, {
      headers: { "X-API-Key": this.configCache.get("apiKey") || "" },
      signal: AbortSignal.timeout(5000),
    });
    const result = (await response.json()) as {
      success: boolean;
      data?: { busy: number };
    };
    if (!result.success || result.data?.busy !== 0) throw new Error("suBusy");
  }

  private async backupData() {
    if (!dataRoot) throw new Error("suBackupFailed");
    const target = path.join(
      dataRoot,
      "update-backups",
      `before-${app.getVersion()}-${randomUUID()}`,
    );
    await mkdir(target, { recursive: true });
    for (const name of ["config.json", "app.db"]) {
      const source = path.join(workspace, name);
      const info = await lstat(source);
      if (!info.isFile() || info.isSymbolicLink())
        throw new Error("suBackupFailed");
      await copyFile(source, path.join(target, name));
    }
    const database = new DatabaseSync(path.join(target, "app.db"), {
      readOnly: true,
    });
    try {
      if (database.prepare("PRAGMA quick_check").get()?.quick_check !== "ok")
        throw new Error("suBackupFailed");
    } finally {
      database.close();
    }
    await writeFile(
      path.join(target, "backup.json"),
      JSON.stringify({
        version: app.getVersion(),
        completed: true,
        createdAt: new Date().toISOString(),
      }),
      { flag: "wx" },
    );
  }

  private async restoreCore() {
    if (!this.coreStopped) return;
    this.restoring ||= this.server.start({ logDir, dbPath: db }).then(() => {
      this.coreStopped = false;
    });
    try {
      await this.restoring;
    } finally {
      this.restoring = undefined;
      this.installing = false;
    }
  }

  async install() {
    if (!this.enabled || this.installing || this.state.status !== "downloaded")
      throw new Error("suNotReady");
    this.installing = true;
    try {
      await this.assertIdle();
      await this.server.stop();
      this.coreStopped = true;
      await this.backupData();
      autoUpdater.quitAndInstall(false, true);
      if (this.state.error) throw new Error(this.state.error);
    } catch (reason) {
      await this.restoreCore();
      this.installing = false;
      this.publish({
        status: "downloaded",
        error:
          reason instanceof Error && reason.message === "suBusy"
            ? "suBusy"
            : "suBackupFailed",
      });
      throw new Error(this.state.error);
    }
  }
}
