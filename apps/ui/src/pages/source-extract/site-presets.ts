export interface SitePreset {
  id: string;
  name: string;
  traditionalName?: string;
  internationalName?: string;
  url: string;
  region: "domestic" | "international";
  aliases?: string[];
}

export const sitePresets: SitePreset[] = [
  {
    id: "bilibili",
    name: "哔哩哔哩",
    traditionalName: "嗶哩嗶哩",
    internationalName: "Bilibili",
    url: "https://www.bilibili.com/",
    region: "domestic",
  },
  {
    id: "douyin",
    name: "抖音",
    internationalName: "Douyin",
    url: "https://www.douyin.com/",
    region: "domestic",
  },
  {
    id: "xiaohongshu",
    name: "小红书",
    traditionalName: "小紅書",
    internationalName: "Xiaohongshu",
    url: "https://www.xiaohongshu.com/",
    region: "domestic",
  },
  {
    id: "kuaishou",
    name: "快手",
    internationalName: "Kuaishou",
    url: "https://www.kuaishou.com/",
    region: "domestic",
  },
  {
    id: "weibo",
    name: "微博",
    internationalName: "Weibo",
    url: "https://weibo.com/",
    region: "domestic",
  },
  {
    id: "zhihu",
    name: "知乎",
    internationalName: "Zhihu",
    url: "https://www.zhihu.com/",
    region: "domestic",
  },
  {
    id: "qqvideo",
    name: "腾讯视频",
    traditionalName: "騰訊視頻",
    internationalName: "Tencent Video",
    url: "https://v.qq.com/",
    region: "domestic",
  },
  {
    id: "youku",
    name: "优酷",
    traditionalName: "優酷",
    internationalName: "Youku",
    url: "https://www.youku.com/",
    region: "domestic",
  },
  {
    id: "iqiyi",
    name: "爱奇艺",
    traditionalName: "愛奇藝",
    internationalName: "iQIYI",
    url: "https://www.iqiyi.com/",
    region: "domestic",
  },
  {
    id: "netease",
    name: "网易云音乐",
    traditionalName: "網易雲音樂",
    internationalName: "NetEase Music",
    url: "https://music.163.com/",
    region: "domestic",
  },
  {
    id: "youtube",
    name: "YouTube",
    url: "https://www.youtube.com/",
    region: "international",
    aliases: ["youtu.be"],
  },
  {
    id: "x",
    name: "X",
    url: "https://x.com/",
    region: "international",
    aliases: ["twitter.com"],
  },
  {
    id: "instagram",
    name: "Instagram",
    url: "https://www.instagram.com/",
    region: "international",
  },
  {
    id: "tiktok",
    name: "TikTok",
    url: "https://www.tiktok.com/",
    region: "international",
  },
  {
    id: "vimeo",
    name: "Vimeo",
    url: "https://vimeo.com/",
    region: "international",
  },
  {
    id: "twitch",
    name: "Twitch",
    url: "https://www.twitch.tv/",
    region: "international",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    url: "https://www.pinterest.com/",
    region: "international",
  },
  {
    id: "pixiv",
    name: "pixiv",
    url: "https://www.pixiv.net/",
    region: "international",
  },
  {
    id: "reddit",
    name: "Reddit",
    url: "https://www.reddit.com/",
    region: "international",
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    url: "https://soundcloud.com/",
    region: "international",
  },
];
export function presetName(site: SitePreset, language: string) {
  if (language === "zh-TW") return site.traditionalName || site.name;
  return language.startsWith("zh")
    ? site.name
    : site.internationalName || site.name;
}
export function presetForURL(value: string) {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    const host = url.hostname.toLowerCase();
    return sitePresets.find((site) =>
      [
        new URL(site.url).hostname.replace(/^www\./, ""),
        ...(site.aliases || []),
      ].some((domain) => host === domain || host.endsWith("." + domain)),
    );
  } catch {
    return undefined;
  }
}
