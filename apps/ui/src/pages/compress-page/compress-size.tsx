import { useEffect, useState } from "react";
import type { Conversion, LocalFileCheck } from "@mediago/shared-common";
import { usePlatform } from "@/hooks/use-platform";
import { useTranslation } from "react-i18next";
import { byteSize, compressionSizeResult } from "./compress-model";
export function useCompressionOutputs(
  rows?: Conversion[],
  refreshKey: string | number | boolean = 0,
) {
  const { shell } = usePlatform(),
    [files, setFiles] = useState<LocalFileCheck[]>([]),
    [failed, setFailed] = useState(false),
    [revision, setRevision] = useState(0);
  const signature = JSON.stringify([
    ...new Set(
      (rows || [])
        .filter((row) => row.status === "done" && row.outputPath)
        .map((row) => row.outputPath),
    ),
  ]);
  useEffect(() => {
    let cancelled = false;
    const paths: string[] = JSON.parse(signature);
    setFiles([]);
    setFailed(false);
    if (!paths.length) return;
    void shell
      .checkFiles(paths, false)
      .then((values) => {
        if (!cancelled) setFiles(values);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [signature, shell, refreshKey, revision]);
  return { files, failed, reload: () => setRevision((value) => value + 1) };
}
export default function CompressionSize({
  row,
  file,
  failed = false,
}: {
  row: Conversion;
  file?: LocalFileCheck;
  failed?: boolean;
}) {
  const { t } = useTranslation();
  if (row.status !== "done") return null;
  if (failed || (file && !file.available))
    return <span className="cvt-error">{t("vpOutputUnavailable")}</span>;
  const result = compressionSizeResult(row, file?.size);
  if (!result) return <span>{t("cLoading")}</span>;
  return (
    <span className="compress-size" data-testid={`compress-size-${row.id}`}>
      {result.trial ? (
        <>
          {t("vpTrialBytes", { size: byteSize(result.output) })}
          {result.estimated !== undefined && (
            <>
              {" "}
              ·{" "}
              <span title={t("vpEstimateHint")}>
                {t("vpEstimated", { size: byteSize(result.estimated) })}
              </span>
            </>
          )}
        </>
      ) : (
        <>
          {!!row.options?.compress?.targetBytes && (
            <>
              {t("vpTargetSummary", {
                size: row.options.compress.targetBytes / 1000000,
              })}{" "}
              ·{" "}
            </>
          )}
          {byteSize(result.source)} → {byteSize(result.output)}
          {result.percent !== undefined && (
            <>
              {" "}
              ·{" "}
              {t(result.percent >= 0 ? "vpSmaller" : "vpLarger", {
                percent: Math.abs(result.percent),
              })}
            </>
          )}
        </>
      )}
    </span>
  );
}
