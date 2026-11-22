export type MediaParseStage = "primary" | "inventory" | "fallback";
export interface MediaParseAttempt {
  route: "primary" | "fallback";
  kind: string;
  message: string;
}
export interface MediaParseFailure {
  attempts: MediaParseAttempt[];
}
export class MediaParseError extends Error {
  constructor(
    message: string,
    readonly failure?: MediaParseFailure,
  ) {
    super(message);
    this.name = "MediaParseError";
  }
}

// Consume this request's response, including split UTF-8 sequences and JSON lines.
export async function readMediaParseStream<T>(
  stream: ReadableStream<Uint8Array>,
  onStage: (stage: MediaParseStage) => void,
  onResult?: (result: T) => void,
): Promise<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    total = 0,
    result: T | undefined;
  let failure: MediaParseError | undefined,
    finished = false;
  function consume(line: string) {
    if (!line.trim()) return;
    if (finished) throw new Error("Unexpected data after media parse result");
    const event = JSON.parse(line);
    if (event.type === "progress") {
      if (["primary", "inventory", "fallback"].includes(event.stage))
        onStage(event.stage);
    } else if (event.type === "result" || event.success === true) {
      result = event.data as T;
      if (!result || typeof result !== "object")
        throw new Error("Invalid media parse result");
      finished = true;
      onResult?.(result);
    } else if (event.type === "error" || event.success === false) {
      failure = new MediaParseError(
        event.message || "Media parsing failed",
        event.failure,
      );
      finished = true;
    } else throw new Error("Invalid media parse response");
  }
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- Chunks share UTF-8/JSON decoder state and must be consumed in order.
      const { value, done } = await reader.read();
      if (value) total += value.byteLength;
      if (total > 8 * 1024 * 1024)
        throw new Error("Media parse response is too large");
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
      if (done) break;
    }
    consume(buffer);
    if (failure) throw failure;
    if (!finished || result === undefined)
      throw new Error("Incomplete media parse response");
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
