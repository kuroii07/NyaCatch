export function trustedApplicationFrame(
  location: { protocol: string; hostname: string; port: string },
  mainFrame: boolean,
  development: boolean,
) {
  if (!mainFrame) return false;
  if (
    location.protocol === "mediago-community:" &&
    location.hostname === "index.html" &&
    !location.port
  )
    return true;
  return (
    development &&
    location.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(location.hostname) &&
    location.port === "8555"
  );
}
