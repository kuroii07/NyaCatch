import { join } from "node:path";
import { URL } from "node:url";
import { provide } from "@inversifyjs/binding-decorators";
import { protocol } from "electron";
import isDev from "electron-is-dev";
import { access, readFile } from "node:fs/promises";
import { injectable } from "inversify";
import mime from "mime-types";
import { defaultScheme } from "../utils";
import { localMediaPreview } from "../services/local-media-preview";

@injectable()
@provide()
export default class ProtocolService {
  create(): void {
    protocol.handle(defaultScheme, async (req) => {
      const pathName = new URL(req.url).pathname;
      if (pathName.startsWith("/__local-preview/"))
        return localMediaPreview.respond(
          req,
          pathName.slice("/__local-preview/".length),
        );
      if (isDev) return new Response(null, { status: 404 });
      // The home URL has pathname "/"; reading the renderer directory fails with EISDIR.
      let filePath = join(
        __dirname,
        "../renderer",
        pathName === "/" ? "index.html" : pathName,
      );
      try {
        await access(filePath);
      } catch {
        filePath = join(__dirname, "../renderer/index.html");
      }
      const mimeType = mime.lookup(filePath);
      const data = await readFile(filePath);
      return new Response(data, {
        headers: { "Content-Type": mimeType || "text/html" },
      });
    });
  }
}
