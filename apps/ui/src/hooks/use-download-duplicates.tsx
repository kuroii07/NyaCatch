import { useEffect, useRef } from "react";
import { App, Button } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { DownloadTask } from "@mediago/shared-common";
import { findDownloadDuplicates } from "../api/download-task";
import "../components/download-efficiency.css";
type Task = Omit<DownloadTask, "id">;
export function useDownloadDuplicates() {
  const { modal } = App.useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const active = useRef<{ cancel: () => void; destroy: () => void } | null>(
    null,
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.cancel();
      active.current?.destroy();
      active.current = null;
    };
  }, []);
  return async (tasks: Task[]): Promise<Task[] | null> => {
    const matches = await findDownloadDuplicates(tasks);
    if (!mounted.current) return null;
    if (!matches.length) return tasks;
    return new Promise((resolve) => {
      const finish = (result: Task[] | null) => {
        resolve(result);
        active.current?.destroy();
        active.current = null;
      };
      const instance = modal.confirm({
        title: t("efDuplicates"),
        width: 620,
        content: (
          <>
            <p>{t("efDuplicateHint")}</p>
            <div className="ef-duplicates">
              {matches.map((match) => (
                <div key={match.index}>
                  <span>
                    <b>
                      #{match.id} · {match.name}
                    </b>
                    <br />
                    {t(match.status === "success" ? "efCompleted" : "efQueued")}
                  </span>
                  <Button
                    onClick={() => {
                      finish(null);
                      navigate(
                        `${match.status === "success" ? "/done" : "/queue"}?search=${encodeURIComponent(match.name)}`,
                      );
                    }}
                  >
                    {t("efView")}
                  </Button>
                </div>
              ))}
            </div>
          </>
        ),
        okText: t("efAgain"),
        cancelText: t("efCancel"),
        onOk: () => finish(tasks),
        onCancel: () => finish(null),
        footer: (_original, { OkBtn, CancelBtn }) => (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            <Button
              data-testid="duplicates-skip"
              onClick={() => {
                const indices = new Set(matches.map((m) => m.index));
                finish(tasks.filter((_, i) => !indices.has(i)));
              }}
            >
              {t("efSkip")}
            </Button>
            <CancelBtn />
            <OkBtn />
          </div>
        ),
      });
      active.current = {
        cancel: () => resolve(null),
        destroy: () => instance.destroy(),
      };
    });
  };
}
