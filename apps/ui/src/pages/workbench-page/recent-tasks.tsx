import useSWR from "swr";
import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getDownloadTasks } from "@/api/download-task";
import { MediaTaskRow } from "@/components/media-task-row";
import { useMediaTaskEvents } from "@/hooks/use-media-task-events";
import { useListMotion } from "@/hooks/use-list-motion";
import { useAppStore } from "@/store/app";

export function RecentTasks() {
  const { t } = useTranslation();
  const local = useAppStore((state) => state.local);
  const { data, error, isLoading, mutate } = useSWR(
    ["workbench-recent", local],
    () => getDownloadTasks({ current: 1, pageSize: 3 }),
  );
  useMediaTaskEvents(mutate);
  const listRef = useRef<HTMLElement>(null);
  useListMotion(
    listRef,
    (data?.list || []).map((task) => task.id),
    JSON.stringify([local]),
  );
  return (
    <section
      ref={listRef}
      className="wb-recent nc-list-motion"
      aria-labelledby="recent-title"
    >
      <div className="wb-section-title">
        <h2 id="recent-title">{t("wbRecent")}</h2>
        <Link to="/queue">
          {t("wbViewQueue")}
          <ArrowUpRight size={15} />
        </Link>
      </div>
      {isLoading && (
        <p className="wb-quiet" role="status">
          {t("wbLoading")}
        </p>
      )}
      {error && (
        <p role="alert">
          {t("wbTasksError")}{" "}
          <button type="button" onClick={() => void mutate()}>
            {t("wbRetry")}
          </button>
        </p>
      )}
      {!error && !isLoading && !data?.list.length && (
        <div className="wb-recent-empty">{t("wbNoTasks")}</div>
      )}
      {data?.list.map((task) => (
        <MediaTaskRow key={task.id} task={task} refresh={mutate} compact />
      ))}
    </section>
  );
}
