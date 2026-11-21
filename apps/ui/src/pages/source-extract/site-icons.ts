const files = import.meta.glob<string>("../../assets/site-icons/*.{png,ico}", {
  eager: true,
  query: "?url",
  import: "default",
});

export const siteIcons: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([file, url]) => [
    file
      .split("/")
      .pop()
      ?.replace(/\.(png|ico)$/, "") || "",
    url,
  ]),
);
