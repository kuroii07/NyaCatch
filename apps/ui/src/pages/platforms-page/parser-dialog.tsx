import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import { ArrowRight, Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { findPlatform, platformDetailKeys } from "./platforms";
import {
  preparePlatformLinks,
  type PlatformParserTarget,
} from "./parser-entry-model";

export function PlatformParserDialog({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: PlatformParserTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const input = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const platform =
    target?.kind === "common" ? findPlatform(target.id) : undefined;
  const name = platform ? t(platform.nameKey) : t("ppAnySite");
  const prepared = preparePlatformLinks(text);
  const multiple = prepared.links.length > 1 && !prepared.error;
  useEffect(() => {
    if (open) {
      setText("");
      setError("");
      submitting.current = false;
    }
  }, [open, target]);

  function submit() {
    if (submitting.current) return;
    const result = preparePlatformLinks(text);
    if (result.error) {
      setError(t(result.error));
      input.current?.focus();
      return;
    }
    submitting.current = true;
    onClose();
    if (result.links.length > 1)
      navigate("/batch", { state: { incomingLinks: result.links } });
    else
      navigate("/", {
        state: {
          platformParse: { id: crypto.randomUUID(), url: result.links[0] },
        },
      });
  }

  return (
    <Modal
      open={open}
      title={t("ppTitle", { name })}
      onCancel={onClose}
      footer={null}
      width={560}
      centered
      rootClassName="p-parser-dialog"
      afterOpenChange={(visible) => {
        if (visible) input.current?.focus();
      }}
    >
      <form
        data-testid="platform-parser-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="p-parser-intro">{t("ppHint")}</p>
        <label htmlFor="platform-parser-input">{t("ppLink")}</label>
        <textarea
          id="platform-parser-input"
          ref={input}
          data-testid="platform-parser-input"
          value={text}
          rows={3}
          spellCheck={false}
          placeholder={t("efSharePlaceholder")}
          aria-invalid={!!error}
          aria-describedby="platform-parser-note platform-parser-error"
          onChange={(event) => {
            setText(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div id="platform-parser-error" role="alert" className="p-parser-error">
          {error}
        </div>
        <p id="platform-parser-note" className="p-parser-note">
          {multiple
            ? t("ppMultiHint")
            : platform
              ? t(platformDetailKeys(platform).limit)
              : t("ppCatalogHint")}
        </p>
        <div className="p-parser-footer">
          <span>{t("ppNoTask")}</span>
          <button
            type="submit"
            className="wb-primary"
            data-testid="platform-parser-submit"
            disabled={!text.trim()}
          >
            <Link2 size={15} />
            {multiple
              ? t("ppBatch", { count: prepared.links.length })
              : t("wbParse")}
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
