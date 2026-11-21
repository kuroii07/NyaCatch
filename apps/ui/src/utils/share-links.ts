// Keep the original URL bytes: signed query strings and fragments identify resources.
export function extractShareLinks(text: string): string[] {
  const exact = text.trim();
  if (/^https?:\/\/\S+$/i.test(exact) && !/[<>「」【】“”]/.test(exact))
    return [exact];
  const matches = text.match(/https?:\/\/[^\s<>"「」【】“”]+/gi) || [];
  return [
    ...new Set(
      matches.map((value) => {
        let url = value.replace(/[，。；！、：！？]+$/u, "");
        for (const [left, right] of [
          ["(", ")"],
          ["[", "]"],
          ["{", "}"],
          ["（", "）"],
        ]) {
          while (
            url.endsWith(right) &&
            url.split(right).length > url.split(left).length
          )
            url = url.slice(0, -1);
        }
        return url;
      }),
    ),
  ];
}
export function validMediaLink(value: string) {
  try {
    const url = new URL(value);
    return (
      value.length <= 8192 &&
      ["http:", "https:"].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
