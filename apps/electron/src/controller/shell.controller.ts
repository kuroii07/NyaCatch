import { provide } from "@inversifyjs/binding-decorators";
import {
  type Controller,
  type LocalFileCheck,
  type CompatiblePreviewState,
  type MediaPreviewCacheInfo,
  IPC,
} from "@mediago/shared-common";
import { handle } from "../core/decorators";
import { TYPES } from "../types/symbols";
import { type IpcMainEvent, shell } from "electron";
import { inject, injectable } from "inversify";
import { isAbsolute, join } from "node:path";
import { stat } from "node:fs/promises";
import MainWindow from "../windows/main.window";
import { resolveDepsBinaries } from "../utils/binaryResolver";
import { inspectLocalMedia } from "../services/video-dimensions";
import { localMediaPreview } from "../services/local-media-preview";
import { defaultScheme } from "../utils";
import { DownloaderServer } from "../services/downloader.server";
import ElectronLogger from "../vendor/ElectronLogger";
import { randomBytes } from "node:crypto";

@injectable()
@provide(TYPES.Controller)
export default class ShellController implements Controller {
  private watched = new WeakSet<Electron.WebContents>();
  private previewEpoch = new Map<number, number>();
  private compatible = new Map<
    string,
    {
      owner: number;
      preview?: { id: string; url: string };
      pending?: Promise<void>;
    }
  >();
  constructor(
    @inject(MainWindow) private readonly mainWindow: MainWindow,
    @inject(DownloaderServer) private readonly server: DownloaderServer,
    @inject(ElectronLogger) private readonly logger: ElectronLogger,
  ) {}

  private watchPreviewOwner(owner: Electron.WebContents) {
    if (this.watched.has(owner)) return;
    this.watched.add(owner);
    const id = owner.id;
    const release = () => {
      this.previewEpoch.set(id, (this.previewEpoch.get(id) || 0) + 1);
      localMediaPreview.releaseOwner(id);
      for (const [job, record] of this.compatible)
        if (record.owner === id)
          void this.releaseCompatible(job).catch((error) =>
            this.logger.error("Failed to release compatible preview", error),
          );
    };
    owner.once("destroyed", release);
    owner.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) release();
    });
  }

  private async previewAPI<T>(
    method: "get" | "post" | "delete",
    suffix = "",
    body?: unknown,
  ): Promise<T> {
    const value = await this.server
      .getClient()
      .api.request<unknown, { success: boolean; data: T; message?: string }>({
        method,
        url: "/api/conversions/preview-cache" + suffix,
        data: body,
        timeout: 15000,
      });
    if (!value.success) throw Error(value.message || "pcUnavailable");
    return value.data;
  }

  private async releaseCompatible(id: string) {
    const record = this.compatible.get(id);
    if (!record) return;
    this.compatible.delete(id);
    if (record.preview)
      localMediaPreview.release(record.preview.id, record.owner);
    await this.previewAPI("delete", "/" + id);
  }

  @handle(IPC.shell.startCompatiblePreview)
  async startCompatiblePreview(event: IpcMainEvent, target: string) {
    const owner = this.previewOwner(event);
    this.watchPreviewOwner(owner);
    const epoch = this.previewEpoch.get(owner.id) || 0;
    const files = await this.checkFiles(event, [target], true);
    if (!files[0]?.available || !files[0].media?.durationMs)
      throw Error("pcUnavailable");
    this.previewOwner(event);
    if ((this.previewEpoch.get(owner.id) || 0) !== epoch)
      throw Error("pcExpired");
    const requestID = randomBytes(32).toString("hex");
    let value: CompatiblePreviewState;
    try {
      value = await this.previewAPI<CompatiblePreviewState>("post", "", {
        path: target,
        id: requestID,
      });
    } catch (error) {
      await this.previewAPI("delete", "/" + requestID).catch((e) =>
        this.logger.error("Failed to cancel uncertain preview", e),
      );
      throw error;
    }
    try {
      this.previewOwner(event);
      if ((this.previewEpoch.get(owner.id) || 0) !== epoch)
        throw Error("pcExpired");
    } catch (error) {
      await this.previewAPI("delete", "/" + value.id);
      throw error;
    }
    this.compatible.set(value.id, { owner: owner.id });
    // Private filesystem paths never cross the preload boundary.
    return {
      id: value.id,
      status: value.status,
      progress: value.progress,
      cached: value.cached,
      error: value.error,
    };
  }

  @handle(IPC.shell.compatiblePreviewStatus)
  async compatiblePreviewStatus(
    event: IpcMainEvent,
    id: string,
  ): Promise<CompatiblePreviewState> {
    const owner = this.previewOwner(event),
      record = this.compatible.get(id);
    if (!record || record.owner !== owner.id) throw Error("pcExpired");
    const value = await this.previewAPI<
      CompatiblePreviewState & { path?: string }
    >("get", "/" + id);
    this.previewOwner(event);
    if (this.compatible.get(id) !== record) throw Error("pcExpired");
    if (value.status === "ready" && !record.preview) {
      // Concurrent status requests must share one playback capability rather
      // than leaking tokens while asynchronous file checks are still running.
      record.pending ||= (async () => {
        const token = await localMediaPreview.create(
          value.path || "",
          owner.id,
        );
        try {
          this.previewOwner(event);
          if (this.compatible.get(id) !== record) throw Error("pcExpired");
        } catch (error) {
          localMediaPreview.release(token, owner.id);
          throw error;
        }
        record.preview = {
          id: token,
          url: `${defaultScheme}://index.html/__local-preview/${token}`,
        };
      })();
      try {
        await record.pending;
      } finally {
        record.pending = undefined;
      }
    }
    return {
      id: value.id,
      status: value.status,
      progress: value.progress,
      cached: value.cached,
      error: value.error,
      ...(record.preview ? { preview: record.preview } : {}),
    };
  }

  @handle(IPC.shell.releaseCompatiblePreview)
  async releaseCompatiblePreview(event: IpcMainEvent, id: string) {
    const owner = this.previewOwner(event),
      record = this.compatible.get(id);
    if (record && record.owner !== owner.id) throw Error("pcExpired");
    await this.releaseCompatible(id);
  }

  @handle(IPC.shell.mediaPreviewCacheInfo)
  async mediaPreviewCacheInfo(event: IpcMainEvent) {
    this.previewOwner(event);
    return this.previewAPI<MediaPreviewCacheInfo>("get");
  }

  @handle(IPC.shell.clearMediaPreviewCache)
  async clearMediaPreviewCache(event: IpcMainEvent) {
    const owner = this.previewOwner(event);
    const ids = Array.from(this.compatible)
      .filter(([, record]) => record.owner === owner.id)
      .map(([id]) => id);
    for (const id of ids) await this.releaseCompatible(id);
    this.previewOwner(event);
    return this.previewAPI<MediaPreviewCacheInfo>("delete");
  }

  private previewOwner(event: IpcMainEvent) {
    const owner = this.mainWindow.window?.webContents;
    if (
      !owner ||
      owner.isDestroyed() ||
      event.sender !== owner ||
      event.senderFrame !== owner.mainFrame
    )
      throw Error("Only the main application frame may preview local media");
    return owner;
  }

  @handle(IPC.shell.createMediaPreview)
  async createMediaPreview(event: IpcMainEvent, target: string) {
    const owner = this.previewOwner(event);
    const files = await this.checkFiles(event, [target], true);
    const media = files[0]?.media;
    if (
      !files[0]?.available ||
      !media ||
      media.durationMs <= 0 ||
      (!media.hasVideo && !media.hasAudio)
    )
      throw Error("Local media is unavailable");
    const id = await localMediaPreview.create(target, owner.id);
    try {
      this.previewOwner(event);
    } catch (error) {
      localMediaPreview.release(id, owner.id);
      throw error;
    }
    this.watchPreviewOwner(owner);
    return { id, url: `${defaultScheme}://index.html/__local-preview/${id}` };
  }

  @handle(IPC.shell.releaseMediaPreview)
  async releaseMediaPreview(event: IpcMainEvent, id: string) {
    const owner = this.previewOwner(event);
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
      throw Error("Invalid preview identifier");
    localMediaPreview.release(id, owner.id);
  }

  @handle(IPC.shell.checkFiles)
  async checkFiles(
    event: IpcMainEvent,
    targets: string[],
    inspectVideo = false,
  ) {
    const owner = this.mainWindow.window?.webContents;
    if (
      !owner ||
      owner.isDestroyed() ||
      event.sender !== owner ||
      event.senderFrame !== owner.mainFrame
    )
      throw Error("Only the main application frame may inspect local files");
    if (
      !Array.isArray(targets) ||
      typeof inspectVideo !== "boolean" ||
      targets.length > (inspectVideo ? 20 : 60) ||
      !targets.every(
        (target) =>
          typeof target === "string" &&
          target.length <= 32768 &&
          !target.includes("\0") &&
          isAbsolute(target),
      )
    )
      throw Error("Invalid local file list");
    const results: LocalFileCheck[] = await Promise.all(
      targets.map(async (target) => {
        try {
          const info = await stat(target);
          return {
            path: target,
            available: info.isFile(),
            ...(info.isFile() ? { size: info.size } : {}),
          };
        } catch {
          return { path: target, available: false };
        }
      }),
    );
    if (inspectVideo) {
      const { depsDir } = resolveDepsBinaries();
      const ffprobe = join(
        depsDir,
        process.platform === "win32" ? "ffprobe.exe" : "ffprobe",
      );
      let index = 0;
      // Large batches must not spawn one ffprobe process for every file at once.
      const next = async (): Promise<void> => {
        const file = results[index++];
        if (!file) return;
        if (file.available)
          Object.assign(file, await inspectLocalMedia(ffprobe, file.path));
        await next();
      };
      await Promise.all([next(), next()]);
    }
    return results;
  }

  @handle(IPC.shell.reveal)
  async reveal(_event: IpcMainEvent, target: string): Promise<void> {
    if (
      typeof target !== "string" ||
      !isAbsolute(target) ||
      !(await stat(target)).isFile()
    )
      throw new Error("Downloaded file is unavailable");
    shell.showItemInFolder(target);
  }
  @handle(IPC.shell.open)
  async open(e: IpcMainEvent, target: string): Promise<void> {
    // URL → openExternal, path → openPath
    if (/^https?:\/\//i.test(target)) {
      await shell.openExternal(target);
    } else {
      const error = await shell.openPath(target);
      if (error) throw new Error(error);
    }
  }
}
