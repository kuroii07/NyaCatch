import { useEffect, useState } from "react";
import { App, Button } from "antd";
import { useTranslation } from "react-i18next";
import { usePlatform } from "@/hooks/use-platform";
import { http } from "@/utils/http";
import {
  SettingsRow as Row,
  SettingsSection as Section,
} from "./settings-controls";

type CacheInfo = { bytes: number; files?: number; busy?: number };
type Kind = "browser" | "preview" | "thumbnail";
const kinds: Kind[] = ["browser", "preview", "thumbnail"];
const title = {
  browser: "smBrowserCache",
  preview: "smPreviewCache",
  thumbnail: "smThumbnailCache",
};
function size(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : bytes < 1073741824
        ? `${(bytes / 1048576).toFixed(1)} MiB`
        : `${(bytes / 1073741824).toFixed(2)} GiB`;
}
export function CachePanel({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const { browser, shell } = usePlatform();
  const { message, modal } = App.useApp();
  const [info, setInfo] = useState<Partial<Record<Kind, CacheInfo>>>({});
  const [errors, setErrors] = useState<Partial<Record<Kind, boolean>>>({});
  const [busy, setBusy] = useState(false);
  async function read(kind: Kind): Promise<CacheInfo> {
    if (kind === "browser") return browser.cacheInfo();
    if (kind === "preview") return shell.mediaPreviewCacheInfo();
    return http.get<never, CacheInfo>("/api/cache/thumbnails");
  }
  async function refresh() {
    setBusy(true);
    try {
      await Promise.all(
        kinds.map(async (kind) => {
          try {
            const next = await read(kind);
            setInfo((prev) => ({ ...prev, [kind]: next }));
            setErrors((prev) => ({ ...prev, [kind]: false }));
          } catch {
            setErrors((prev) => ({ ...prev, [kind]: true }));
          }
        }),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (active) void refresh();
  }, [active]);
  async function clear(kind: Kind) {
    setBusy(true);
    try {
      if (kind === "browser") await browser.clearCache();
      else if (kind === "preview") await shell.clearMediaPreviewCache();
      else await http.delete("/api/cache/thumbnails");
      message.success(t("smCacheCleared"));
    } catch {
      message.error(t("smCacheFailed"));
    } finally {
      await refresh();
    }
  }
  return (
    <Section title={t("smCacheTitle")} hint={t("smCacheHint")}>
      <div data-testid="settings-cache-panel">
        {kinds.map((kind) => (
          <Row
            key={kind}
            title={t(title[kind])}
            hint={t(`${title[kind]}Hint`)}
            wide
          >
            <div className="s-cache-actions">
              <span data-testid={`cache-size-${kind}`} role="status">
                {errors[kind]
                  ? t("smCacheFailed")
                  : info[kind]
                    ? size(info[kind]?.bytes ?? 0)
                    : t("smCacheLoading")}
                {!errors[kind] && (info[kind]?.busy ?? 0) > 0
                  ? ` · ${t("smCacheBusy", { count: info[kind]?.busy })}`
                  : ""}
              </span>
              <Button
                data-testid={`cache-clear-${kind}`}
                disabled={busy}
                onClick={() => void clear(kind)}
              >
                {t("clearCache")}
              </Button>
            </div>
          </Row>
        ))}
        <div className="s-actions">
          <Button
            data-testid="cache-refresh"
            loading={busy}
            onClick={() => void refresh()}
          >
            {t("smRefresh")}
          </Button>
          <Button
            danger
            data-testid="clear-website-data"
            disabled={busy}
            onClick={() =>
              modal.confirm({
                title: t("smWebsiteData"),
                content: t("smWebsiteConfirm"),
                okText: t("smWebsiteData"),
                cancelText: t("cancel"),
                okButtonProps: { danger: true },
                onOk: async () => {
                  setBusy(true);
                  try {
                    await browser.clearWebsiteData();
                    message.success(t("smWebsiteCleared"));
                  } catch {
                    message.error(t("smCacheFailed"));
                    throw new Error(t("smCacheFailed"));
                  } finally {
                    setBusy(false);
                  }
                },
              })
            }
          >
            {t("smWebsiteData")}
          </Button>
        </div>
      </div>
    </Section>
  );
}
