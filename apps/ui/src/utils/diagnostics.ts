import { classifyMediaError } from "./media-error";

const ALLOWED_THEMES = new Set([
  "cream",
  "sky",
  "celadon",
  "iris",
  "sakura",
  "sunset",
  "system",
  "light",
  "dark",
]);
const ALLOWED_LANGUAGES = new Set(["system", "zh", "zh-TW", "en", "ja", "ko"]);
const ALLOWED_TASK_TYPES = new Set([
  "youtube-single",
  "youtube",
  "bilibili",
  "m3u8",
  "direct",
  "image",
]);
const ALLOWED_TASK_STATUSES = new Set([
  "ready",
  "pending",
  "downloading",
  "stopped",
  "failed",
  "success",
]);
const ALLOWED_ERROR_CATEGORIES = new Set([
  "network",
  "source-restriction",
  "unsupported-media",
  "software-failure",
]);
const ALLOWED_TOOLS = new Set([
  "yt-dlp",
  "ffmpeg",
  "ffprobe",
  "BBDown",
  "N_m3u8DL-RE",
]);

export interface DiagnosticTaskInput {
  type: unknown;
  status: unknown;
  errorSummary?: unknown;
  errorCategory?: unknown;
  [key: string]: unknown;
}

export interface DiagnosticReportInput {
  productVersion: string;
  upstreamVersion: string;
  electronVersion: string;
  nodeVersion: string;
  osVersion?: string;
  platform: string;
  arch: string;
  tools: Record<string, unknown>;
  preferences: {
    language: unknown;
    theme: unknown;
    maxRunner: unknown;
    [key: string]: unknown;
  };
  recentTasks: DiagnosticTaskInput[];
}

function enumValue(value: unknown, allowed: Set<string>) {
  return typeof value === "string" && allowed.has(value) ? value : "unknown";
}

export function sanitizeDiagnosticText(value: unknown): string {
  if (typeof value !== "string") return "";
  return (
    value
      // Redact JSON-style credential fields before the generic key/value rules.
      // Error logs frequently serialize request options as one-line JSON.
      .replace(
        /(["']?)(cookie|set-cookie|authorization|proxy-authorization|api[-_ ]?key|access[_ -]?token|refresh[_ -]?token|token|password|secret|proxy)\1\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,}\\s]+)/gi,
        "$2=[REDACTED]",
      )
      .replace(
        /\b(?:cookie|set-cookie)\b\s*[:=]\s*[^\s;]+(?:;\s*[^;\s]+)*/gi,
        "Cookie=[REDACTED]",
      )
      .replace(
        /\b(cookie|set-cookie|authorization|proxy-authorization|api[-_ ]?key|access[_ -]?token|refresh[_ -]?token|token|password|secret|proxy)\b\s*[:=]\s*(?:(?:Bearer|Basic)\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        "$1=[REDACTED]",
      )
      .replace(/\b([A-Za-z][\w-]*)\s*=\s*[^\s,;]+/g, "$1=[REDACTED]")
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
      .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
      .replace(
        /[?&](?:token|key|signature|sig|auth|expires|policy)=[^&#\s]*/gi,
        "[REDACTED]",
      )
      .replace(/\b[A-Z]:[\\/][^\s"'<>]*/gi, "[PATH]")
      .replace(/(?:^|\s)(?:\\\\|\/\/)[^\s"'<>]+/g, " [PATH]")
      .replace(
        /(?:^|\s)\/(?:Users|home|tmp|var|private)\/[^\s"'<>]*/g,
        " [PATH]",
      )
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 400)
  );
}

export function diagnosticErrorSummary(logText: unknown): string {
  if (typeof logText !== "string") return "";
  const line = logText
    .split(/\r?\n/)
    .reverse()
    .find((entry) => /\b(error|failed|exception|fatal)\b/i.test(entry));
  return sanitizeDiagnosticText(line);
}

export function diagnosticErrorDetails(logText: unknown): {
  category: string;
  summary: string;
} {
  const summary = diagnosticErrorSummary(logText);
  const category = classifyMediaError(
    typeof logText === "string" ? logText : "",
  );
  return { category, summary };
}

export function createDiagnosticReport(input: DiagnosticReportInput) {
  const tools = Object.fromEntries(
    Object.entries(input.tools)
      .filter(
        ([name, version]) =>
          ALLOWED_TOOLS.has(name) &&
          typeof version === "string" &&
          version.length <= 40,
      )
      .map(([name, version]) => [name, sanitizeDiagnosticText(version)]),
  );

  return {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    app: {
      name: "NyaCatch",
      version: sanitizeDiagnosticText(input.productVersion),
      upstreamVersion: sanitizeDiagnosticText(input.upstreamVersion),
    },
    runtime: {
      electron: sanitizeDiagnosticText(input.electronVersion),
      node: sanitizeDiagnosticText(input.nodeVersion),
      operatingSystemVersion: sanitizeDiagnosticText(
        input.osVersion || "unknown",
      ),
      platform: sanitizeDiagnosticText(input.platform),
      architecture: sanitizeDiagnosticText(input.arch),
    },
    tools,
    preferences: {
      language: enumValue(input.preferences.language, ALLOWED_LANGUAGES),
      theme: enumValue(input.preferences.theme, ALLOWED_THEMES),
      maxConcurrentDownloads:
        typeof input.preferences.maxRunner === "number" &&
        Number.isInteger(input.preferences.maxRunner) &&
        input.preferences.maxRunner >= 1 &&
        input.preferences.maxRunner <= 50
          ? input.preferences.maxRunner
          : "unknown",
    },
    recentTasks: input.recentTasks.slice(0, 8).map((task) => ({
      type: enumValue(task.type, ALLOWED_TASK_TYPES),
      status: enumValue(task.status, ALLOWED_TASK_STATUSES),
      errorCategory: enumValue(task.errorCategory, ALLOWED_ERROR_CATEGORIES),
      errorSummary: sanitizeDiagnosticText(task.errorSummary),
    })),
  };
}
