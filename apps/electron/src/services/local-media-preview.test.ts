import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalMediaPreview } from "./local-media-preview";

test("local preview serves bounded ranges and HEAD without exposing paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preview-range-"));
  const file = join(dir, "本地 #音频.wav");
  const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  await writeFile(file, bytes);
  const service = new LocalMediaPreview();
  const id = await service.create(file, 1);
  assert.match(id, /^[a-f0-9]{64}$/);
  const request = (headers?: Record<string, string>, method = "GET") =>
    service.respond(
      new Request("mediago-community://index.html/__local-preview/" + id, {
        method,
        headers,
      }),
      id,
    );
  const full = await request();
  assert.equal(full.status, 200);
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
  const range = await request({ Range: "bytes=12-31" });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("Content-Range"), "bytes 12-31/256");
  assert.deepEqual(
    Buffer.from(await range.arrayBuffer()),
    bytes.subarray(12, 32),
  );
  const suffix = await request({ Range: "bytes=-4" });
  assert.deepEqual(
    Buffer.from(await suffix.arrayBuffer()),
    bytes.subarray(252),
  );
  const head = await request({ Range: "bytes=250-999" }, "HEAD");
  assert.equal(head.status, 206);
  assert.equal(head.headers.get("Content-Length"), "6");
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  await Promise.all(
    [
      "bytes=256-",
      "bytes=9-3",
      "bytes=-0",
      "bytes=1-2,5-6",
      "bytes=9007199254740993-",
      "bad",
    ].map(async (Range) =>
      assert.equal((await request({ Range })).status, 416),
    ),
  );
  assert.equal((await request({ Origin: "https://example.com" })).status, 403);
  assert.equal((await request(undefined, "POST")).status, 405);
  service.release(id, 2);
  assert.equal((await request(undefined, "HEAD")).status, 200);
  service.releaseOwner(1);
  assert.equal((await request()).status, 410);
  assert.equal(
    (await service.respond(new Request("http://local"), "../anything")).status,
    410,
  );
});

test("local preview rejects directories, relative paths and unbounded session growth", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preview-limit-"));
  const file = join(dir, "a.mp4");
  await writeFile(file, "local-test");
  const service = new LocalMediaPreview();
  await assert.rejects(service.create(dir, 1));
  await assert.rejects(service.create("relative.mp4", 1));
  await assert.rejects(service.create("bad\0path", 1));
  await Promise.all(Array.from({ length: 8 }, () => service.create(file, 1)));
  await assert.rejects(service.create(file, 1), /Too many/);
  service.releaseOwner(1);
  const id = await service.create(file, 1);
  service.release(id, 1);
});
