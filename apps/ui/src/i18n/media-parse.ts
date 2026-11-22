export const mediaParseMessages: Record<string, Record<string, string>> = {
  zh: {
    xpStagePrimary: "正在解析链接…",
    xpStageInventory: "正在检查 X 帖子中的资源…",
    xpStageFallback: "主解析未获取媒体，正在尝试备用解析…",
    xpRetry: "重新解析",
    xpRoutePrimary: "主解析",
    xpRouteFallback: "匿名备用解析",
    xpFallbackTimeout: "备用解析超时，请检查网络后重试。",
    xpFallbackNetwork: "无法连接备用解析服务或媒体，请检查代理和网络后重试。",
    xpFallbackService: "备用解析服务暂时不可用，请稍后重试。",
    xpFallbackRateLimit: "备用解析请求过于频繁，请稍后重试。",
    xpFallbackRestricted:
      "备用路线也无法访问此内容，请确认原帖是否公开及可访问。",
    xpFallbackUnavailable:
      "主解析和备用路线均未获取到支持的媒体，请确认原帖是否仍可访问。",
    xpFallbackVerification:
      "已找到媒体，但未能验证视频信息，请检查网络后重试。",
    xpFallbackFailed: "主解析和备用解析均未完成，请重试或展开查看原因。",
    xpCauseTimeout: "请求超时",
    xpCauseNetwork: "网络连接失败",
    xpCauseService: "服务响应异常",
    xpCauseRateLimit: "请求限流",
    xpCauseRestricted: "来源访问受限",
    xpCauseUnavailable: "未获取到支持的媒体",
    xpCauseVerification: "媒体验证失败",
    xpCauseUnknown: "解析失败",
  },
  "zh-TW": {
    xpStagePrimary: "正在解析連結…",
    xpStageInventory: "正在檢查 X 貼文中的資源…",
    xpStageFallback: "主解析未取得媒體，正在嘗試備用解析…",
    xpRetry: "重新解析",
    xpRoutePrimary: "主解析",
    xpRouteFallback: "匿名備用解析",
    xpFallbackTimeout: "備用解析逾時，請檢查網路後重試。",
    xpFallbackNetwork: "無法連線至備用解析服務或媒體，請檢查代理與網路後重試。",
    xpFallbackService: "備用解析服務暫時無法使用，請稍後重試。",
    xpFallbackRateLimit: "備用解析請求過於頻繁，請稍後重試。",
    xpFallbackRestricted:
      "備用路線也無法存取此內容，請確認原貼文是否公開且可存取。",
    xpFallbackUnavailable:
      "主解析與備用路線均未取得支援的媒體，請確認原貼文是否仍可存取。",
    xpFallbackVerification:
      "已找到媒體，但無法驗證影片資訊，請檢查網路後重試。",
    xpFallbackFailed: "主解析與備用解析均未完成，請重試或展開查看原因。",
    xpCauseTimeout: "請求逾時",
    xpCauseNetwork: "網路連線失敗",
    xpCauseService: "服務回應異常",
    xpCauseRateLimit: "請求限流",
    xpCauseRestricted: "來源存取受限",
    xpCauseUnavailable: "未取得支援的媒體",
    xpCauseVerification: "媒體驗證失敗",
    xpCauseUnknown: "解析失敗",
  },
  en: {
    xpStagePrimary: "Parsing link…",
    xpStageInventory: "Checking media in this X post…",
    xpStageFallback: "Primary route found no media. Trying fallback…",
    xpRetry: "Retry parsing",
    xpRoutePrimary: "Primary route",
    xpRouteFallback: "Public fallback",
    xpFallbackTimeout: "Fallback timed out. Check your connection and retry.",
    xpFallbackNetwork:
      "Cannot reach the fallback service or media. Check your proxy and connection.",
    xpFallbackService:
      "Fallback service is temporarily unavailable. Retry shortly.",
    xpFallbackRateLimit: "Fallback requests are rate limited. Retry later.",
    xpFallbackRestricted:
      "The fallback cannot access this content. Check that the post is public and accessible.",
    xpFallbackUnavailable:
      "Neither route found supported media. Check that the post is still accessible.",
    xpFallbackVerification:
      "Media found, but video details could not be verified. Check your connection and retry.",
    xpFallbackFailed:
      "Both parsing routes failed. Retry or expand the details.",
    xpCauseTimeout: "Request timed out",
    xpCauseNetwork: "Connection failed",
    xpCauseService: "Service response error",
    xpCauseRateLimit: "Rate limited",
    xpCauseRestricted: "Access restricted",
    xpCauseUnavailable: "No supported media returned",
    xpCauseVerification: "Media verification failed",
    xpCauseUnknown: "Parsing failed",
  },
  ja: {
    xpStagePrimary: "リンクを解析中…",
    xpStageInventory: "X の投稿内のメディアを確認中…",
    xpStageFallback: "主経路で取得できないため、予備経路で解析中…",
    xpRetry: "再解析",
    xpRoutePrimary: "主経路",
    xpRouteFallback: "匿名の予備経路",
    xpFallbackTimeout:
      "予備経路がタイムアウトしました。接続を確認して再試行してください。",
    xpFallbackNetwork:
      "予備サービスまたはメディアに接続できません。プロキシと接続を確認してください。",
    xpFallbackService:
      "予備サービスを一時的に利用できません。しばらくして再試行してください。",
    xpFallbackRateLimit:
      "予備経路のリクエストが制限されています。時間をおいて再試行してください。",
    xpFallbackRestricted:
      "予備経路でもアクセスできません。元の投稿が公開され、閲覧可能か確認してください。",
    xpFallbackUnavailable:
      "どちらの経路でも対応メディアを取得できませんでした。元の投稿を確認してください。",
    xpFallbackVerification:
      "メディアは見つかりましたが、動画情報を検証できません。接続を確認して再試行してください。",
    xpFallbackFailed:
      "両方の解析経路で失敗しました。再試行するか詳細を確認してください。",
    xpCauseTimeout: "タイムアウト",
    xpCauseNetwork: "接続失敗",
    xpCauseService: "サービス応答エラー",
    xpCauseRateLimit: "リクエスト制限",
    xpCauseRestricted: "アクセス制限",
    xpCauseUnavailable: "対応メディアなし",
    xpCauseVerification: "メディア検証失敗",
    xpCauseUnknown: "解析失敗",
  },
  ko: {
    xpStagePrimary: "링크 분석 중…",
    xpStageInventory: "X 게시물의 미디어 확인 중…",
    xpStageFallback: "기본 경로에서 미디어를 찾지 못해 대체 경로로 분석 중…",
    xpRetry: "다시 분석",
    xpRoutePrimary: "기본 경로",
    xpRouteFallback: "공개 대체 경로",
    xpFallbackTimeout:
      "대체 분석 시간이 초과되었습니다. 연결을 확인하고 다시 시도하세요.",
    xpFallbackNetwork:
      "대체 서비스나 미디어에 연결할 수 없습니다. 프록시와 네트워크를 확인하세요.",
    xpFallbackService:
      "대체 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요.",
    xpFallbackRateLimit:
      "대체 경로 요청이 제한되었습니다. 나중에 다시 시도하세요.",
    xpFallbackRestricted:
      "대체 경로에서도 접근할 수 없습니다. 원본 게시물이 공개되어 있는지 확인하세요.",
    xpFallbackUnavailable:
      "두 경로 모두 지원 미디어를 찾지 못했습니다. 원본 게시물에 접근할 수 있는지 확인하세요.",
    xpFallbackVerification:
      "미디어를 찾았지만 영상 정보를 확인하지 못했습니다. 연결을 확인하고 다시 시도하세요.",
    xpFallbackFailed:
      "두 분석 경로 모두 실패했습니다. 다시 시도하거나 세부 정보를 확인하세요.",
    xpCauseTimeout: "요청 시간 초과",
    xpCauseNetwork: "연결 실패",
    xpCauseService: "서비스 응답 오류",
    xpCauseRateLimit: "요청 제한",
    xpCauseRestricted: "접근 제한",
    xpCauseUnavailable: "지원 미디어 없음",
    xpCauseVerification: "미디어 확인 실패",
    xpCauseUnknown: "분석 실패",
  },
};
