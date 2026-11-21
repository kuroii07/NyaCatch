// Snapshot of the 2026-10-28 isolated 0.5.1 audit; counts are sample results, not platform guarantees.
export interface BatchEvidence {
  id: string;
  name: string;
  parsed: number;
  total: number;
  downloadTested: boolean;
}

export const BATCH_EVIDENCE_DATE = "2026-10-28";
export const BATCH_EVIDENCE: BatchEvidence[] = [
  {
    id: "bilibili",
    name: "Bilibili",
    parsed: 4,
    total: 5,
    downloadTested: false,
  },
  {
    id: "youtube",
    name: "YouTube",
    parsed: 4,
    total: 5,
    downloadTested: false,
  },
  { id: "x", name: "X", parsed: 4, total: 5, downloadTested: false },
  {
    id: "instagram",
    name: "Instagram",
    parsed: 5,
    total: 5,
    downloadTested: false,
  },
  { id: "douyin", name: "Douyin", parsed: 2, total: 2, downloadTested: true },
  {
    id: "xiaohongshu",
    name: "Xiaohongshu",
    parsed: 0,
    total: 2,
    downloadTested: true,
  },
  { id: "vimeo", name: "Vimeo", parsed: 0, total: 1, downloadTested: false },
  {
    id: "dailymotion",
    name: "Dailymotion",
    parsed: 1,
    total: 1,
    downloadTested: false,
  },
  { id: "tiktok", name: "TikTok", parsed: 1, total: 1, downloadTested: false },
  { id: "twitch", name: "Twitch", parsed: 0, total: 1, downloadTested: false },
  {
    id: "soundcloud",
    name: "SoundCloud",
    parsed: 1,
    total: 1,
    downloadTested: false,
  },
  { id: "ted", name: "TED", parsed: 1, total: 1, downloadTested: false },
  { id: "reddit", name: "Reddit", parsed: 0, total: 1, downloadTested: false },
];
