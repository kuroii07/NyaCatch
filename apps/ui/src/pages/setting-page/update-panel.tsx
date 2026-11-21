import { useEffect, useState } from "react";
import { App, Button, Progress } from "antd";
import { useTranslation } from "react-i18next";
import type { AppUpdateState } from "@mediago/shared-common";
import { usePlatform } from "@/hooks/use-platform";

export function UpdatePanel({
  onEnabled,
}: {
  onEnabled: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const { modal, message } = App.useApp();
  const [state, setState] = useState<AppUpdateState>({
    status: "idle",
    enabled: false,
    installed: false,
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void platform.update
      .state()
      .then(setState)
      .catch(() => {});
    const receive = (...args: unknown[]) => {
      const next = args[args.length - 1] as AppUpdateState;
      if (next && typeof next.status === "string") setState(next);
    };
    platform.on("update:state", receive);
    return () => platform.off("update:state", receive);
  }, [platform]);
  useEffect(() => onEnabled(state.enabled), [state.enabled, onEnabled]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      setState(await platform.update.state());
    } catch (reason) {
      const key =
        reason instanceof Error
          ? reason.message.match(/su[A-Z]\w+/)?.[0]
          : undefined;
      message.error(t(key || "suCheckFailed"));
      throw reason;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div data-testid="settings-online-update" className="s-row s-row-wide">
      <div className="s-row-label">
        <p>{t(state.enabled ? "suInstalledHint" : "suPortableHint")}</p>
        {state.enabled && (
          <p role="status" data-testid="update-status">
            {t(state.error || `suStatus_${state.status}`)}
            {state.version ? ` · ${state.version}` : ""}
          </p>
        )}
      </div>
      {state.status === "downloading" && (
        <Progress percent={state.progress || 0} />
      )}
      {state.enabled && (
        <div className="s-actions">
          <Button
            data-testid="update-check"
            loading={busy || state.status === "checking"}
            disabled={
              state.status === "downloading" || state.status === "downloaded"
            }
            onClick={() =>
              void run(() => platform.update.check()).catch(() => {})
            }
          >
            {t("suCheck")}
          </Button>
          {state.status === "available" && (
            <Button
              data-testid="update-download"
              loading={busy}
              onClick={() =>
                void run(() => platform.update.startDownload()).catch(() => {})
              }
            >
              {t("suDownload")}
            </Button>
          )}
          {state.status === "downloaded" && (
            <Button
              data-testid="update-install"
              type="primary"
              loading={busy}
              onClick={() =>
                modal.confirm({
                  title: t("suInstall"),
                  content: t("suInstallConfirm"),
                  okText: t("suInstall"),
                  cancelText: t("cancel"),
                  onOk: () => run(() => platform.update.install()),
                })
              }
            >
              {t("suInstall")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
