import { BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import isDev from "electron-is-dev";
import { resolve } from "node:path";
import { APP_PREVIEW_TITLE } from "@mediago/shared-common";
import windowIcon from "../../assets/icon.png";

export default class Window {
  window: BrowserWindow | null = null;
  options: BrowserWindowConstructorOptions;
  url: string;

  constructor(options: BrowserWindowConstructorOptions) {
    this.options = options;
  }

  create() {
    if (!this.url) {
      throw new Error("url is required");
    }

    const window = new BrowserWindow({
      title: APP_PREVIEW_TITLE,
      icon: resolve(__dirname, windowIcon),
      ...this.options,
    });
    void window.loadURL(this.url);

    window.once("ready-to-show", this.readyToShow);
    // close can be cancelled; release only the instance that actually closed.
    window.once("closed", () => {
      if (this.window === window) this.window = null;
    });

    return window;
  }

  readyToShow = () => {
    if (
      !this.window ||
      this.window.isDestroyed() ||
      this.window.webContents.isDestroyed()
    )
      return;

    this.window.show();

    if (isDev) {
      this.window.webContents.openDevTools();
    }
  };

  send(channel: string, ...args: unknown[]) {
    const target = this.window;
    if (!target || target.isDestroyed() || target.webContents.isDestroyed())
      return;
    target.webContents.send(channel, ...args);
  }
}
