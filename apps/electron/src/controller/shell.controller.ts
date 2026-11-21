import { provide } from "@inversifyjs/binding-decorators";
import {
  type Controller,
  type LocalFileCheck,
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

@injectable()
@provide(TYPES.Controller)
export default class ShellController implements Controller {
  private watched = new WeakSet<Electron.WebContents>();
  constructor(@inject(MainWindow) private readonly mainWindow: MainWindow) {}

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
    if (!this.watched.has(owner)) {
      this.watched.add(owner);
      const ownerId = owner.id;
      owner.once("destroyed", () => localMediaPreview.releaseOwner(ownerId));
      owner.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
        if (mainFrame && !inPlace) localMediaPreview.releaseOwner(ownerId);
      });
    }
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
