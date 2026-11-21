import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePlatform } from "@/hooks/use-platform";
import { useMergeWorkspace } from "@/store/merge-workspace";
import { filenameForPath } from "../converter-page/converter-model";
import {
  appendMergeItems,
  mergeFormats,
  mergeMode,
  MERGE_LIMIT,
} from "./merge-model";

export function defaultMergeName(file: string) {
  return (
    Array.from(filenameForPath(file).replace(/\.[^.]+$/, ""))
      .slice(0, 70)
      .join("") + "-merged"
  );
}
export function useMergeHandoff() {
  const { t } = useTranslation(),
    { message, modal } = App.useApp(),
    { shell } = usePlatform(),
    navigate = useNavigate();
  const generation = useRef(0),
    [sending, setSending] = useState(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function send(paths: string[]) {
    if (sending || !paths.length) return;
    const epoch = ++generation.current,
      initial = useMergeWorkspace.getState();
    if (initial.busy || initial.draft.locked) {
      message.warning(t("mgTransferLocked"));
      return;
    }
    const snapshot = initial.draft;
    if (snapshot.items.length + paths.length > MERGE_LIMIT) {
      message.warning(t("mgLimit"));
      return;
    }
    setSending(true);
    try {
      const files = await shell.checkFiles(
          [...snapshot.items.map((item) => item.path), ...paths],
          true,
        ),
        mode = mergeMode(files);
      if (epoch !== generation.current) return;
      if (!mode) {
        message.error(t("mgInvalidFiles"));
        return;
      }
      const unchanged = () => {
        const state = useMergeWorkspace.getState();
        return (
          epoch === generation.current &&
          state.draft === snapshot &&
          !state.busy &&
          !state.draft.locked
        );
      };
      if (!unchanged()) {
        message.warning(t("mgDraftChanged"));
        return;
      }
      if (snapshot.items.length) {
        const confirmed = await new Promise<boolean>((resolve) =>
          modal.confirm({
            title: t("mgTransferTitle"),
            content: t("mgTransferHint"),
            onOk: () => {
              resolve(true);
            },
            onCancel: () => {
              resolve(false);
            },
          }),
        );
        if (!confirmed) return;
      }
      if (!unchanged()) {
        if (epoch === generation.current) message.warning(t("mgDraftChanged"));
        return;
      }
      if (
        !initial.save((draft) => ({
          ...appendMergeItems(draft, paths),
          format: mergeFormats[mode].includes(draft.format)
            ? draft.format
            : mode === "video"
              ? "mp4"
              : "mp3",
          name: draft.name || defaultMergeName(paths[0]),
        }))
      ) {
        message.error(t("mgStorageError"));
        return;
      }
      navigate("/merge");
      message.success(t("mgSent"));
    } catch {
      if (epoch === generation.current) message.error(t("mgInvalidFiles"));
    } finally {
      if (epoch === generation.current) setSending(false);
    }
  }
  return { send, sending };
}
