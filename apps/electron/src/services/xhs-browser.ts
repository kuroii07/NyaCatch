import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, session } from "electron";
import { browserProxyConfig } from "./browser-proxy";
import { normalizeXhsNote, xhsNoteId } from "./xhs-metadata";
import { douyinSource, normalizeDouyin } from "./douyin-metadata";
import { douyinPreload } from "./douyin-preload";
import { installPostNavigationGuard } from "./post-browser-navigation";

// The browser is an anonymous metadata helper, not the user's browsing session.
export class XhsBrowserBridge {
  private server?: Server;
  private readonly secret = randomBytes(32).toString("hex");
  private readonly slots = [false, false];
  private readonly partitionPrefix = randomBytes(16).toString("hex");
  private readonly windows = new Set<BrowserWindow>();
  private preload = "";

  async start(): Promise<Record<string, string>> {
    this.preload = path.join(
      app.getPath("sessionData"),
      "nyacatch-douyin-preload.cjs",
    );
    writeFileSync(this.preload, douyinPreload, {
      encoding: "utf8",
      mode: 0o600,
    });
    this.server = createServer((req, res) => {
      const supplied = String(req.headers.authorization || "");
      const expected = `Bearer ${this.secret}`;
      if (
        req.method !== "POST" ||
        req.url !== "/resolve" ||
        Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
      ) {
        res.writeHead(403).end();
        return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 16384) req.destroy();
        else chunks.push(chunk);
      });
      req.on("end", () => {
        const slot = this.slots.indexOf(false);
        if (slot < 0) {
          res.writeHead(503).end();
          return;
        }
        let body: { source: string; proxy: string };
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          try {
            xhsNoteId(body.source);
          } catch {
            douyinSource(body.source);
          }
          if (typeof body.proxy !== "string" || body.proxy.length > 1024)
            throw Error();
        } catch {
          res.writeHead(400).end();
          return;
        }
        this.slots[slot] = true;
        const abort = new AbortController();
        res.on("close", () => {
          if (!res.writableEnded) abort.abort();
        });
        void this.resolve(body.source, body.proxy, slot, abort.signal)
          .then(
            (data) => {
              if (!res.destroyed) {
                res.writeHead(200, {
                  "Content-Type": "application/json",
                  "Cache-Control": "no-store",
                });
                res.end(JSON.stringify(data));
              }
            },
            (error: unknown) => {
              if (!res.destroyed) {
                const reason =
                  error instanceof Error &&
                  [
                    "navigate",
                    "redirect",
                    "extract",
                    "normalize",
                    "normalize-cdn",
                    "normalize-image",
                    "normalize-duplicate",
                  ].includes(error.message)
                    ? error.message
                    : "session";
                res
                  .writeHead(422, { "Content-Type": "application/json" })
                  .end(JSON.stringify({ reason }));
              }
            },
          )
          .finally(() => {
            this.slots[slot] = false;
          });
      });
    });
    this.server.requestTimeout = 10000;
    this.server.headersTimeout = 10000;
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === "string")
      throw new Error("browser bridge failed to bind");
    return {
      NYACATCH_XHS_BRIDGE: `http://127.0.0.1:${address.port}/resolve`,
      NYACATCH_XHS_SECRET: this.secret,
    };
  }

  async stop(): Promise<void> {
    for (const window of this.windows)
      if (!window.isDestroyed()) window.destroy();
    this.windows.clear();
    if (this.server)
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
        this.server!.closeAllConnections();
      });
    this.server = undefined;
  }

  private async resolve(
    source: string,
    proxy: string,
    slot: number,
    signal: AbortSignal,
  ) {
    let isDouyin = false;
    try {
      xhsNoteId(source);
    } catch {
      douyinSource(source);
      isDouyin = true;
    }
    const id = isDouyin ? douyinSource(source) : xhsNoteId(source);
    const browserSession = session.fromPartition(
      `xhs-${this.partitionPrefix}-${slot}`,
    );
    await browserSession.clearStorageData();
    await browserSession.setProxy(
      proxy ? browserProxyConfig(true, proxy) : { mode: "direct" },
    );
    await browserSession.closeAllConnections();
    if (signal.aborted) throw new Error("cancelled");
    let navigations = 0;
    browserSession.webRequest.onBeforeRequest((details, callback) => {
      try {
        const url = new URL(details.url);
        let validNavigation = true;
        if (!isDouyin && details.resourceType === "mainFrame") {
          try {
            const next = xhsNoteId(details.url);
            validNavigation = ++navigations <= 8 && (!id || next === id);
          } catch {
            validNavigation = false;
          }
        }
        const allowed = (
          isDouyin
            ? [
                "douyin.com",
                "iesdouyin.com",
                "douyinstatic.com",
                "douyincdn.com",
                "douyinpic.com",
                "byteimg.com",
                "bytedance.com",
                "bytedstatic.com",
                "bytegoofy.com",
                "bytetos.com",
                "bytescm.com",
                "bytednsdoc.com",
                "yhgfb-cn-static.com",
                "snssdk.com",
                "zijieapi.com",
              ]
            : ["xiaohongshu.com", "xhscdn.com", "xhslink.com", "xhslink.cn"]
        ).some(
          (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
        );
        callback({
          cancel:
            url.protocol !== "https:" ||
            !!url.port ||
            !!url.username ||
            !!url.password ||
            !validNavigation ||
            !allowed ||
            details.resourceType === "media",
        });
      } catch {
        callback({ cancel: true });
      }
    });
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        session: browserSession,
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        preload: this.preload,
      },
    });
    this.windows.add(window);
    window.webContents.setAudioMuted(true);
    // Non-HTTP schemes do not pass through webRequest. Block automatic app
    // wake-ups here before Chromium can hand them to the operating system.
    installPostNavigationGuard(
      window.webContents,
      isDouyin ? "douyin" : "xiaohongshu",
    );
    const cancel = () => {
      if (!window.isDestroyed()) window.destroy();
    };
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      if (!window.isDestroyed()) window.destroy();
    }, 35000);
    try {
      if (isDouyin) {
        void window.loadURL(source).catch(() => {});
        let captured: any;
        let finalId = "";
        for (let attempt = 0; attempt < 100; attempt++) {
          if (signal.aborted || window.isDestroyed())
            throw new Error("navigate");
          await new Promise((resolve) => setTimeout(resolve, 200));
          try {
            finalId = douyinSource(window.webContents.getURL());
            if (!finalId || (id && finalId !== id)) continue;
            captured = await window.webContents.executeJavaScript(
              "window.__nyaDouyin || null",
            );
            if (captured) break;
          } catch {
            /* Navigation may still be in progress. */
          }
        }
        if (!captured || !finalId) throw new Error("extract");
        try {
          return normalizeDouyin(
            source,
            finalId,
            captured,
            window.webContents.getUserAgent(),
          );
        } catch {
          throw new Error("normalize");
        }
      }
      try {
        const navigation = new URL(source);
        // App share links commonly use HTTP; navigate only to the HTTPS endpoint.
        if (!id) navigation.protocol = "https:";
        await window.loadURL(navigation.href);
      } catch {
        throw new Error("navigate");
      }
      let resolvedId: string;
      const resolvedSource = window.webContents.getURL();
      try {
        resolvedId = xhsNoteId(resolvedSource);
        if (!resolvedId || (id && resolvedId !== id)) throw new Error();
      } catch {
        throw new Error("redirect");
      }
      let note: unknown;
      try {
        note = await window.webContents.executeJavaScript(
          `(() => { const n = window.__INITIAL_STATE__?.note?.noteDetailMap?.[${JSON.stringify(resolvedId)}]?.note; if (!n) return null; return { noteId: n.noteId, type: n.type, title: typeof n.title === 'string' ? n.title.slice(0, 500) : '', imageList: Array.isArray(n.imageList) ? n.imageList.slice(0, 21).map(i => ({ fileId: typeof i.fileId === 'string' ? i.fileId.slice(0, 513) : '', urlDefault: typeof i.urlDefault === 'string' ? i.urlDefault.slice(0, 8193) : '' })) : [] }; })()`,
        );
      } catch {
        throw new Error("extract");
      }
      try {
        return normalizeXhsNote(source, note, resolvedSource);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        throw new Error(
          message === "untrusted image source"
            ? "normalize-cdn"
            : message === "invalid image"
              ? "normalize-image"
              : message === "duplicate image identity"
                ? "normalize-duplicate"
                : "normalize",
        );
      }
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      this.windows.delete(window);
      if (!window.isDestroyed()) window.destroy();
      await browserSession.clearStorageData();
    }
  }
}
