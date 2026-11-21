export function unwrapIpcResult(result: unknown): unknown {
  if (result && typeof result === "object" && "code" in result) {
    const response = result as Record<string, unknown>;
    const code = response.code;
    if (typeof code === "number" && code !== 0) {
      const message =
        typeof response.message === "string"
          ? response.message
          : "IPC request failed";
      throw new Error(message);
    }
    return response.data;
  }
  return result;
}
