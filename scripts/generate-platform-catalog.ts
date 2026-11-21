import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseExtractorList,
  type EngineCatalogData,
} from "../apps/ui/src/pages/platforms-page/engine-model";
import websites from "../apps/ui/src/pages/platforms-page/engine-websites.generated.json";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binary = path.join(
  root,
  ".deps",
  `${process.platform}-${process.arch}`,
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
);
const options = {
  encoding: "utf8" as const,
  windowsHide: true,
  timeout: 30000,
  maxBuffer: 4 * 1024 * 1024,
};
const version = execFileSync(
  binary,
  ["--ignore-config", "--version"],
  options,
).trim();
const versions = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/deps-versions.json"), "utf8"),
);
if (version !== versions["yt-dlp"].version)
  throw new Error(
    "Bundled yt-dlp version does not match the pinned tools manifest",
  );
if (websites.version !== version)
  throw new Error(
    "Regenerate the website directory from this bundled engine version before building",
  );
const output = execFileSync(
  binary,
  [
    "--ignore-config",
    "--plugin-dirs",
    path.join(root, "apps/core/plugins"),
    "--list-extractors",
  ],
  options,
);
const catalog: EngineCatalogData = {
  schemaVersion: 1,
  engine: "yt-dlp",
  version,
  binarySha256: createHash("sha256")
    .update(fs.readFileSync(binary))
    .digest("hex"),
  rawEntryCount: output.split(/\r?\n/).filter((x) => x.trim()).length,
  extractors: parseExtractorList(output),
};
const websiteRules = new Set([
  ...Object.keys(websites.rules),
  ...Object.keys(websites.unavailable),
]);
if (
  websiteRules.size !== catalog.extractors.length ||
  catalog.extractors.some((entry) => !websiteRules.has(entry.id))
)
  throw new Error(
    "Website provenance does not match the actual bundled extractor rules",
  );
const destination = path.join(
  root,
  "apps/ui/src/pages/platforms-page/engine-catalog.generated.json",
);
const json = JSON.stringify(catalog, null, 2) + "\n";
if (
  !fs.existsSync(destination) ||
  fs.readFileSync(destination, "utf8") !== json
)
  fs.writeFileSync(destination, json);
process.stdout.write(
  `Platform catalog: ${catalog.extractors.length} unique extractor rules, ${catalog.extractors.filter((x) => x.broken).length} marked broken; yt-dlp ${version}\n`,
);
