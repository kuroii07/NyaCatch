import { useEffect, useState } from "react";
import { inspectSubtitle, type SubtitleInfo } from "@/api/conversion";
import type { SubtitleBinding } from "./subtitle-model";
export async function checkSubtitleBindings(
  bindings:
    | Record<string, Pick<SubtitleBinding, "path" | "sourceHash" | "enabled">>
    | undefined,
  paths: string[],
  signal?: AbortSignal,
) {
  const rows = await Promise.all(
    paths
      .flatMap((path) => {
        const binding = bindings?.[path];
        return binding?.enabled ? [{ path, binding }] : [];
      })
      .map(async ({ path, binding }) => {
        try {
          const info = await inspectSubtitle(binding.path, signal);
          return {
            path,
            info,
            error:
              info.hash !== binding.sourceHash ? "vpSubChanged" : undefined,
          };
        } catch {
          return { path, info: undefined, error: "vpSubReadFailed" };
        }
      }),
  );
  const infos: Record<string, SubtitleInfo> = {},
    errors: Record<string, string> = {};
  for (const row of rows) {
    if (row.info) infos[row.path] = row.info;
    if (row.error) errors[row.path] = row.error;
  }
  return { infos, errors };
}
export function useCompressionSubtitles(
  bindings: Record<string, SubtitleBinding> | undefined,
  refresh: number | string,
) {
  const enabled = Object.entries(bindings || {}).filter(([, b]) => b.enabled);
  const signature = JSON.stringify(
    enabled.map(([p, b]) => [p, b.path, b.sourceHash]),
  );
  const checkKey = JSON.stringify([signature, refresh]);
  const [state, setState] = useState<{
    signature: string;
    infos: Record<string, SubtitleInfo>;
    errors: Record<string, string>;
  }>({ signature: "", infos: {}, errors: {} });
  useEffect(() => {
    const abort = new AbortController();
    const rows: [string, string, string][] = JSON.parse(signature);
    const current = Object.fromEntries(
      rows.map(([p, path, sourceHash]) => [
        p,
        { path, sourceHash, enabled: true },
      ]),
    );
    void checkSubtitleBindings(
      current,
      rows.map(([p]) => p),
      abort.signal,
    ).then((result) => {
      if (!abort.signal.aborted) setState({ signature: checkKey, ...result });
    });
    return () => abort.abort();
  }, [signature, refresh, checkKey]);
  const infos = state.signature === checkKey ? state.infos : {},
    errors = state.signature === checkKey ? state.errors : {};
  const pending = enabled.some(([path]) => !infos[path] && !errors[path]);
  return { infos, errors, pending, problem: Object.values(errors)[0] };
}
