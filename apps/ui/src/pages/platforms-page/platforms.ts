export type PlatformRegion = "domestic" | "overseas";
export type PlatformMedia = "video" | "audio" | "image" | "cover";
export type PlatformStatus = "verified" | "partial" | "engine" | "planned";

export interface SupportedPlatform {
  id: string;
  nameKey: string;
  region: PlatformRegion;
  media: PlatformMedia[];
  status: PlatformStatus;
  website: string;
  verifiedAt?: string;
  searchTerms: string[];
  extractorPrefix?: string;
}

export const PLATFORM_CATALOG: SupportedPlatform[] = [
  {
    id: "bilibili",
    nameKey: "pBilibili",
    region: "domestic",
    media: ["video", "audio", "cover"],
    status: "partial",
    website: "https://www.bilibili.com/",
    verifiedAt: "2026-10-24",
    searchTerms: [
      "bilibili",
      "哔哩哔哩",
      "嗶哩嗶哩",
      "b站",
      "bili",
      "ビリビリ",
      "빌리빌리",
    ],
  },
  {
    id: "youtube",
    nameKey: "pYoutube",
    region: "overseas",
    media: ["video", "audio", "cover"],
    status: "partial",
    website: "https://www.youtube.com/",
    verifiedAt: "2026-10-24",
    searchTerms: ["youtube", "油管", "yt", "ユーチューブ", "유튜브"],
  },
  {
    id: "x",
    nameKey: "pX",
    region: "overseas",
    media: ["video", "audio", "image", "cover"],
    status: "partial",
    website: "https://x.com/",
    verifiedAt: "2026-10-24",
    searchTerms: ["x", "twitter", "推特", "ツイッター", "트위터"],
  },
  {
    id: "instagram",
    nameKey: "pInstagram",
    region: "overseas",
    media: ["video", "audio", "image", "cover"],
    status: "verified",
    website: "https://www.instagram.com/",
    verifiedAt: "2026-10-24",
    searchTerms: ["instagram", "ig", "ins", "照片墙", "インスタ", "인스타그램"],
  },
  {
    id: "douyin",
    nameKey: "pDouyin",
    region: "domestic",
    media: ["video", "audio", "cover"],
    status: "partial",
    website: "https://www.douyin.com/",
    verifiedAt: "2026-11-04",
    searchTerms: ["douyin", "抖音"],
  },
  {
    id: "xiaohongshu",
    nameKey: "pXiaohongshu",
    region: "domestic",
    media: ["video", "audio", "image", "cover"],
    status: "partial",
    website: "https://www.xiaohongshu.com/",
    verifiedAt: "2026-11-04",
    searchTerms: ["xiaohongshu", "小红书", "小紅書", "rednote", "샤오홍슈"],
  },
  {
    id: "weibo",
    nameKey: "pWeibo",
    region: "domestic",
    media: ["video", "audio", "cover"],
    status: "engine",
    website: "https://weibo.com/",
    searchTerms: ["weibo", "微博", "ウェイボー", "웨이보"],
  },
  {
    id: "zhihu",
    nameKey: "pZhihu",
    region: "domestic",
    media: ["video", "audio", "cover"],
    status: "engine",
    website: "https://www.zhihu.com/",
    searchTerms: ["zhihu", "知乎", "지후"],
  },
  {
    id: "qqvideo",
    nameKey: "pQQVideo",
    region: "domestic",
    media: ["video", "audio", "cover"],
    status: "engine",
    extractorPrefix: "vqq",
    website: "https://v.qq.com/",
    searchTerms: [
      "qqvideo",
      "vqq",
      "tencent",
      "腾讯视频",
      "騰訊視頻",
      "텐센트",
    ],
  },
  {
    id: "youku",
    nameKey: "pYouku",
    region: "domestic",
    media: ["video", "audio", "cover"],
    status: "engine",
    website: "https://www.youku.com/",
    searchTerms: ["youku", "优酷", "優酷", "유쿠"],
  },
  {
    id: "iqiyi",
    nameKey: "pIqiyi",
    region: "domestic",
    media: ["video", "audio", "cover"],
    status: "engine",
    website: "https://www.iqiyi.com/",
    searchTerms: ["iqiyi", "爱奇艺", "愛奇藝", "아이치이"],
  },
  {
    id: "netease",
    nameKey: "pNetease",
    region: "domestic",
    media: ["audio", "cover"],
    status: "engine",
    website: "https://music.163.com/",
    searchTerms: [
      "netease",
      "网易云音乐",
      "網易雲音樂",
      "163",
      "cloud music",
      "왕이",
    ],
  },
  {
    id: "tiktok",
    nameKey: "pTiktok",
    region: "overseas",
    media: ["video", "audio", "cover"],
    status: "engine",
    website: "https://www.tiktok.com/",
    searchTerms: ["tiktok", "tik tok", "ティックトック", "틱톡"],
  },
  {
    id: "vimeo",
    nameKey: "pVimeo",
    region: "overseas",
    media: ["video", "audio", "cover"],
    status: "engine",
    website: "https://vimeo.com/",
    searchTerms: ["vimeo", "维密欧", "ヴィメオ", "비메오"],
  },
  {
    id: "twitch",
    nameKey: "pTwitch",
    region: "overseas",
    media: ["video", "audio", "cover"],
    status: "engine",
    website: "https://www.twitch.tv/",
    searchTerms: ["twitch", "图奇", "圖奇", "ツイッチ", "트위치"],
  },
  {
    id: "pinterest",
    nameKey: "pPinterest",
    region: "overseas",
    media: ["video", "audio", "cover"],
    status: "engine",
    website: "https://www.pinterest.com/",
    searchTerms: ["pinterest", "拼趣", "ピンタレスト", "핀터레스트"],
  },
  {
    id: "reddit",
    nameKey: "pReddit",
    region: "overseas",
    media: ["video", "audio", "cover"],
    status: "engine",
    website: "https://www.reddit.com/",
    searchTerms: ["reddit", "红迪", "紅迪", "レディット", "레딧"],
  },
  {
    id: "soundcloud",
    nameKey: "pSoundcloud",
    region: "overseas",
    media: ["audio", "cover"],
    status: "engine",
    website: "https://soundcloud.com/",
    searchTerms: [
      "soundcloud",
      "sound cloud",
      "声云",
      "聲雲",
      "サウンドクラウド",
      "사운드클라우드",
    ],
  },
];

export function platformDetailKeys(platform: SupportedPlatform) {
  return {
    evidence:
      platform.status === "engine"
        ? "pEngineEvidence"
        : `pEvidence_${platform.id}`,
    limit:
      platform.status === "engine" ? "pEngineLimit" : `pLimit_${platform.id}`,
  };
}

// Navigation accepts catalog IDs, never arbitrary URLs from query parameters.
export function findPlatform(id: string | null): SupportedPlatform | undefined {
  return PLATFORM_CATALOG.find((platform) => platform.id === id);
}

export interface PlatformFilters {
  region: "all" | PlatformRegion;
  media: "all" | PlatformMedia;
  status: "all" | PlatformStatus;
  query: string;
}

export function filterPlatforms(
  catalog: SupportedPlatform[],
  filters: PlatformFilters,
): SupportedPlatform[] {
  const query = filters.query.trim().toLowerCase();
  return catalog.filter((platform) => {
    if (filters.region !== "all" && platform.region !== filters.region)
      return false;
    if (filters.media !== "all" && !platform.media.includes(filters.media))
      return false;
    if (filters.status !== "all" && platform.status !== filters.status)
      return false;
    return (
      !query ||
      platform.id.toLowerCase().includes(query) ||
      platform.searchTerms.some((term) => term.toLowerCase().includes(query))
    );
  });
}
