import { randomBytes } from "node:crypto";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { Readable } from "node:stream";
import type { ReadStream } from "node:fs";
import mime from "mime-types";

interface PreviewFile {
  path: string;
  owner: number;
  expires: number;
  streams: Set<ReadStream>;
}

// URLs contain only a random capability. A path is accepted through the trusted
// main-frame IPC; the protocol never converts a URL into a filesystem path.
export class LocalMediaPreview {
  private files = new Map<string, PreviewFile>();

  async create(target: string, owner: number) {
    if (
      typeof target !== "string" ||
      !isAbsolute(target) ||
      target.includes("\0") ||
      target.length > 32768
    )
      throw Error("Invalid local media path");
    const file = await realpath(target);
    if (!(await stat(file)).isFile()) throw Error("Local media is unavailable");
    for (const [token, item] of this.files)
      if (item.expires < Date.now()) this.release(token, item.owner);
    if (
      [...this.files.values()].filter((item) => item.owner === owner).length >=
      8
    )
      throw Error("Too many local previews");
    const id = randomBytes(32).toString("hex");
    this.files.set(id, {
      path: file,
      owner,
      expires: Date.now() + 12 * 60 * 60 * 1000,
      streams: new Set(),
    });
    return id;
  }

  release(id: string, owner: number) {
    const item = this.files.get(id);
    if (!item || item.owner !== owner) return;
    this.files.delete(id);
    for (const stream of item.streams) stream.destroy();
  }

  releaseOwner(owner: number) {
    for (const [id, item] of this.files)
      if (item.owner === owner) this.release(id, owner);
  }

  async respond(request: Request, id: string): Promise<Response> {
    const item = this.files.get(id);
    if (!item || item.expires < Date.now()) {
      if (item) this.release(id, item.owner);
      return new Response(null, { status: 410 });
    }
    if (!["GET", "HEAD"].includes(request.method))
      return new Response(null, { status: 405 });
    const origin = request.headers.get("Origin");
    if (
      origin &&
      !["mediago-community://index.html", "http://localhost:8555"].includes(
        origin,
      )
    )
      return new Response(null, { status: 403 });
    let handle;
    try {
      handle = await open(item.path, "r");
    } catch {
      return new Response(null, { status: 404 });
    }
    try {
      const info = await handle.stat();
      if (!info.isFile() || this.files.get(id) !== item) {
        await handle.close();
        return new Response(null, { status: 410 });
      }
      const headers: Record<string, string> = {
        "Content-Type": mime.lookup(item.path) || "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      };
      if (origin) headers["Access-Control-Allow-Origin"] = origin;
      let start = 0,
        end = info.size - 1,
        status = 200;
      const range = request.headers.get("Range");
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) start = -1;
        else if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
        else {
          start = Number(match[1]);
          if (match[2]) end = Math.min(end, Number(match[2]));
        }
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          start > end ||
          start >= info.size
        ) {
          await handle.close();
          return new Response(null, {
            status: 416,
            headers: { ...headers, "Content-Range": `bytes */${info.size}` },
          });
        }
        status = 206;
        headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
      }
      headers["Content-Length"] = String(Math.max(0, end - start + 1));
      if (request.method === "HEAD" || info.size === 0) {
        await handle.close();
        return new Response(null, { status, headers });
      }
      const stream = handle.createReadStream({ start, end, autoClose: true });
      item.streams.add(stream);
      const abort = () => stream.destroy();
      request.signal.addEventListener("abort", abort, { once: true });
      stream.once("close", () => {
        item.streams.delete(stream);
        request.signal.removeEventListener("abort", abort);
      });
      if (request.signal.aborted) stream.destroy();
      return new Response(
        Readable.toWeb(stream) as ReadableStream<Uint8Array>,
        { status, headers },
      );
    } catch (error) {
      await handle.close().catch(() => undefined);
      throw error;
    }
  }
}

export const localMediaPreview = new LocalMediaPreview();
