import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePlatform } from "@/hooks/use-platform";
import { useConverterWorkspace } from "@/store/converter-workspace";
import { appendConverterDraft } from "./converter-workspace";
import { audioInputIssue } from "./audio-model";

export function useAudioHandoff() {
  const { t } = useTranslation(),
    { message } = App.useApp(),
    { shell } = usePlatform(),
    navigate = useNavigate();
  const generation = useRef(0),
    inFlight = useRef(false),
    [sending, setSending] = useState(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function send(paths: string[]) {
    if (inFlight.current || !paths.length) return;
    const initial = useConverterWorkspace.getState(),
      snapshot = initial.workspace,
      ticket = ++generation.current;
    if (initial.submitting || snapshot.submission !== "idle") {
      message.warning(t("c11Locked"));
      return;
    }
    const result = appendConverterDraft(snapshot, "audio", paths);
    if (result.excess) {
      message.warning(t("axLimit"));
      return;
    }
    if (result.paths.length === snapshot.drafts.audio.length) {
      message.warning(t("c11NoFiles"));
      return;
    }
    inFlight.current = true;
    setSending(true);
    try {
      const format = snapshot.drafts.audio.length
        ? snapshot.formats.audio
        : "original";
      const files = await shell.checkFiles(result.paths, true);
      if (ticket !== generation.current) return;
      if (
        result.paths.some((path) =>
          audioInputIssue(
            files.find((file) => file.path === path),
            format === "original",
          ),
        )
      ) {
        message.error(t("axCheck"));
        return;
      }
      const current = useConverterWorkspace.getState();
      if (current.submitting || current.workspace.submission !== "idle") {
        message.warning(t("c11Locked"));
        return;
      }
      if (current.workspace !== snapshot) {
        message.warning(t("axChanged"));
        return;
      }
      if (
        !current.save(() => ({
          ...result.workspace,
          formats: { ...result.workspace.formats, audio: format },
        }))
      ) {
        message.error(t("c11StorageError"));
        return;
      }
      navigate("/converter");
      message.success(t("axSent"));
    } catch {
      if (ticket === generation.current) message.error(t("c11CheckFailed"));
    } finally {
      inFlight.current = false;
      if (ticket === generation.current) setSending(false);
    }
  }
  return { send, sending };
}
