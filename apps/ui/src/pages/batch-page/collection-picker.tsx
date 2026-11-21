import { useEffect, useRef, useState } from "react";
import { ListVideo, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  resolveCollection,
  type CollectionEntry,
  type MediaCollection,
} from "../../api/media";
import {
  collectionCandidate,
  mergeCollectionEntries,
} from "./collection-model";
import "./collection.css";

interface Props {
  initialURL: string;
  initialPage?: MediaCollection;
  disabled: boolean;
  onParse: (entries: CollectionEntry[], source: string) => void;
}
export default function CollectionPicker({
  initialURL,
  initialPage,
  disabled,
  onParse,
}: Props) {
  const { t } = useTranslation();
  const [url, setURL] = useState(initialURL);
  const [open, setOpen] = useState(!!initialURL);
  const [result, setResult] = useState<MediaCollection | null>(
    initialPage || null,
  );
  const [entries, setEntries] = useState<CollectionEntry[]>(
    initialPage?.entries || [],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const anchor = useRef(0);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (initialURL === url && result && !initialPage) return;
    request.current?.abort();
    setBusy(false);
    setURL(initialURL);
    setOpen(!!initialURL);
    setResult(initialPage || null);
    setEntries(initialPage?.entries || []);
    setSelected([]);
    setError("");
  }, [initialURL, initialPage]);
  useEffect(() => {
    if (initialURL && !initialPage && !(result && url === initialURL))
      void load(false, initialURL);
  }, [initialURL, initialPage]);
  async function load(more = false, sourceURL = url) {
    if (busy || disabled) return;
    if (!collectionCandidate(sourceURL)) {
      setError(t("clSupported"));
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    if (!more) {
      setEntries([]);
      setSelected([]);
      setResult(null);
    }
    try {
      const next = await resolveCollection(
        more && result ? result.url : sourceURL,
        more && result ? result.page + 1 : 1,
        controller.signal,
      );
      if (request.current !== controller || controller.signal.aborted) return;
      if (!next) {
        setError(t("clNoCollection"));
        return;
      }
      setResult(next);
      setEntries((previous) =>
        more ? mergeCollectionEntries(previous, next.entries) : next.entries,
      );
    } catch (reason) {
      if (!controller.signal.aborted && request.current === controller)
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
  function select(ids: string[]) {
    if (ids.length > 200) {
      setError(t("clLimit"));
      return;
    }
    setSelected(ids);
    setError("");
  }
  return (
    <section className="cl-picker" data-testid="collection-picker">
      <button
        type="button"
        className="cl-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ListVideo size={19} />
        {t("clTitle")}
      </button>
      {open && (
        <>
          <p className="cl-hint">{t("clSupported")}</p>
          <form
            className="cl-input"
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <input
              aria-label={t("clURL")}
              data-testid="collection-url"
              value={url}
              onChange={(event) => {
                request.current?.abort();
                setBusy(false);
                setURL(event.target.value);
                setResult(null);
                setEntries([]);
                setSelected([]);
                setError("");
              }}
              placeholder={t("clURL")}
              disabled={disabled}
            />
            <button
              type="submit"
              className="wb-secondary"
              data-testid="collection-load"
              disabled={disabled || busy || !url.trim()}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : null}
              {t("clLoad")}
            </button>
            {busy && (
              <button
                type="button"
                className="wb-secondary"
                onClick={() => {
                  request.current?.abort();
                  setBusy(false);
                }}
              >
                {t("btCancel")}
              </button>
            )}
          </form>
          {error && (
            <p className="batch-error" role="alert">
              {error}
            </p>
          )}
          {result && (
            <>
              <div className="cl-heading">
                <h2>{result.title || t("clTitle")}</h2>
                <span>
                  {t(result.total ? "clCount" : "clCountUnknown", {
                    loaded: entries.length,
                    total: result.total,
                  })}
                </span>
              </div>
              <div className="cl-actions">
                <button
                  type="button"
                  className="wb-secondary"
                  disabled={disabled || busy}
                  onClick={() =>
                    select(
                      entries
                        .filter((item) => item.available)
                        .map((item) => item.id),
                    )
                  }
                >
                  {t("clSelectLoaded")}
                </button>
                <button
                  type="button"
                  className="wb-secondary"
                  disabled={disabled || !selected.length}
                  onClick={() => select([])}
                >
                  {t("clClear")}
                </button>
                <span aria-live="polite">
                  {t("btSelected", { count: selected.length })}
                </span>
                <button
                  type="button"
                  className="wb-primary cl-parse"
                  data-testid="collection-parse"
                  disabled={disabled || busy || !selected.length}
                  onClick={() =>
                    onParse(
                      entries.filter((item) => selected.includes(item.id)),
                      result.url,
                    )
                  }
                >
                  {t("clParse", { count: selected.length })}
                </button>
              </div>
              <div className="cl-list" data-testid="collection-list">
                {entries.map((entry, index) => (
                  <label
                    key={entry.id}
                    className={`cl-entry${selected.includes(entry.id) ? " is-selected" : ""}`}
                    data-testid="collection-entry"
                  >
                    <input
                      type="checkbox"
                      aria-label={entry.title || String(entry.index)}
                      checked={selected.includes(entry.id)}
                      disabled={disabled || !entry.available}
                      onChange={(event) => {
                        if ((event.nativeEvent as MouseEvent).shiftKey) {
                          const checked = event.target.checked;
                          const range = entries
                            .slice(
                              Math.min(anchor.current, index),
                              Math.max(anchor.current, index) + 1,
                            )
                            .filter((item) => item.available)
                            .map((item) => item.id);
                          select(
                            checked
                              ? [...new Set([...selected, ...range])]
                              : selected.filter((id) => !range.includes(id)),
                          );
                        } else {
                          anchor.current = index;
                          select(
                            event.target.checked
                              ? [...selected, entry.id]
                              : selected.filter((id) => id !== entry.id),
                          );
                        }
                      }}
                    />
                    <span className="cl-number">{entry.index}</span>
                    <span className="cl-entry-title">
                      {entry.title || t("clUntitled")}
                      <small>
                        {entry.available
                          ? entry.duration
                            ? Math.floor(entry.duration / 60) +
                              ":" +
                              String(Math.floor(entry.duration % 60)).padStart(
                                2,
                                "0",
                              )
                            : entry.id
                          : t("clUnavailable")}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <div className="cl-actions cl-footer">
                {result.hasMore && (
                  <button
                    type="button"
                    className="wb-secondary"
                    data-testid="collection-more"
                    onClick={() => void load(true)}
                    disabled={disabled || busy}
                  >
                    {t("clMore")}
                  </button>
                )}
              </div>
              <p className="cl-hint">{t("clHint")}</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
