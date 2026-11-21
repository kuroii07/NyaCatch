const en = {
  pPublicRoute: "Public fallback",
  pPublicRouteHint:
    "Resolved via the FxEmbed public service using only the public post ID. One verified MP4 quality is available. Download and retry refresh the media URL.",
  pPlay: "Play preview",
  pListen: "Listen",
  pLoading: "Preparing preview…",
  pBuffering: "Buffering…",
  pRetry: "Retry playback",
  pStop: "Stop preview",
  pClickHint: "Loads on click · Preview quality is selected automatically",
  pUnavailable: "Preview unavailable. Retry or continue downloading.",
  pAudioOriginal: "Original audio preview",
};
type Messages = Record<keyof typeof en, string>;
export const playbackTranslations = {
  en,
  zh: {
    pPublicRoute: "匿名备用路线",
    pPublicRouteHint:
      "通过 FxEmbed 公开服务解析，仅发送公开帖子 ID。当前提供一档已验证的 MP4 画质，下载与重试会重新获取媒体地址。",
    pPlay: "播放预览",
    pListen: "试听音频",
    pLoading: "正在准备预览…",
    pBuffering: "正在缓冲…",
    pRetry: "重新播放",
    pStop: "停止预览",
    pClickHint: "点击后加载 · 预览画质自动选择",
    pUnavailable: "暂时无法预览，可重试或继续下载。",
    pAudioOriginal: "原始音轨试听",
  } satisfies Messages,
  "zh-TW": {
    pPublicRoute: "匿名備用路線",
    pPublicRouteHint:
      "透過 FxEmbed 公開服務解析，僅傳送公開貼文 ID。目前提供一種已驗證的 MP4 畫質，下載與重試會重新取得媒體網址。",
    pPlay: "播放預覽",
    pListen: "試聽音訊",
    pLoading: "正在準備預覽…",
    pBuffering: "正在緩衝…",
    pRetry: "重新播放",
    pStop: "停止預覽",
    pClickHint: "點擊後載入 · 自動選擇預覽畫質",
    pUnavailable: "暫時無法預覽，可重試或繼續下載。",
    pAudioOriginal: "原始音軌試聽",
  } satisfies Messages,
  ja: {
    pPublicRoute: "公開予備ルート",
    pPublicRouteHint:
      "公開投稿 ID のみを FxEmbed に送信して解析します。検証済み MP4 を1画質で提供し、ダウンロードと再試行時に URL を再取得します。",
    pPlay: "プレビュー再生",
    pListen: "音声を試聴",
    pLoading: "プレビューを準備中…",
    pBuffering: "読み込み中…",
    pRetry: "再試行",
    pStop: "プレビューを停止",
    pClickHint: "クリックで読み込み · 画質は自動選択",
    pUnavailable:
      "プレビューできません。再試行するか、ダウンロードを続けてください。",
    pAudioOriginal: "元の音声を試聴",
  } satisfies Messages,
  ko: {
    pPublicRoute: "공개 예비 경로",
    pPublicRouteHint:
      "공개 게시물 ID만 FxEmbed에 전송합니다. 검증된 MP4 화질 한 가지를 제공하며 다운로드 및 재시도 시 미디어 주소를 다시 가져옵니다.",
    pPlay: "미리보기 재생",
    pListen: "오디오 미리듣기",
    pLoading: "미리보기 준비 중…",
    pBuffering: "버퍼링 중…",
    pRetry: "다시 재생",
    pStop: "미리보기 중지",
    pClickHint: "클릭하면 로드 · 미리보기 화질 자동 선택",
    pUnavailable: "미리볼 수 없습니다. 다시 시도하거나 다운로드하세요.",
    pAudioOriginal: "원본 오디오 미리듣기",
  } satisfies Messages,
};
