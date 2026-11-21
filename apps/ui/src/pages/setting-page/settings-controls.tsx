import { type ReactNode } from "react";

export function SettingsSection({
  title,
  hint,
  children,
  id,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="s-section" data-testid={id}>
      <header>
        <h3>{title}</h3>
        {hint && <p>{hint}</p>}
      </header>
      <div className="s-section-body">{children}</div>
    </section>
  );
}

export function SettingsRow({
  title,
  hint,
  children,
  field,
  wide = false,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  field?: string;
  wide?: boolean;
}) {
  return (
    <div className={`s-row${wide ? " s-row-wide" : ""}`} data-setting={field}>
      <div className="s-row-label">
        <label htmlFor={field ? `setting-${field}` : undefined}>{title}</label>
        {hint && <p>{hint}</p>}
      </div>
      <div className="s-row-control">{children}</div>
    </div>
  );
}

export function isValidServiceUrl(value: string, proxy = false) {
  try {
    const url = new URL(value);
    return (
      (proxy
        ? ["http:", "https:", "socks5:", "socks5h:"]
        : ["http:", "https:"]
      ).includes(url.protocol) &&
      !!url.hostname &&
      !/\s/.test(value) &&
      (!proxy || (!url.search && !url.hash && ["", "/"].includes(url.pathname)))
    );
  } catch {
    return false;
  }
}
