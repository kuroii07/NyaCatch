import type { ProxyConfig, Session } from "electron";

export function browserProxyConfig(
  useProxy: boolean,
  address: string,
): ProxyConfig {
  // An empty fixed-server rule forces DIRECT instead of inheriting Windows/PAC.
  if (!useProxy) return { mode: "system" };

  const value = address?.trim();
  if (!value) throw new Error("Browser proxy address is empty");
  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value.replace(/^socks5h:\/\//i, "socks5://")
    : `http://${value}`;
  const url = new URL(normalized);
  if (!url.hostname || !["http:", "https:", "socks5:"].includes(url.protocol)) {
    throw new Error("Invalid browser proxy address");
  }
  return { mode: "fixed_servers", proxyRules: normalized };
}

export async function applyBrowserProxy(
  target: Pick<Session, "setProxy" | "closeAllConnections">,
  config: ProxyConfig,
): Promise<void> {
  await target.setProxy(config);
  // Reused sockets can retain the old route after changing a session's proxy.
  await target.closeAllConnections();
}
