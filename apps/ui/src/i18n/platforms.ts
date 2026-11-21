import { platformShortcutTranslations } from "./platform-shortcuts";

export const platformTranslations = {
  zh: {
    ...platformShortcutTranslations.zh,
    pNav: "支持平台",
    pTitle: "支持平台",
    pSubtitle: "从平台出发，查看可获取的资源与验证范围",
    pSearch: "搜索平台名称或别名",
    pRegion: "地区",
    pMedia: "资源类型",
    pStatus: "支持状态",
    pAll: "全部",
    pDomestic: "国内",
    pOverseas: "海外",
    pVideo: "视频",
    pAudio: "音频",
    pImage: "帖子图片",
    pCover: "封面",
    pVerified: "样例已验证",
    pPartial: "部分支持",
    pPlanned: "待验证",
    pVerifiedHint: "列出的公开样例已通过，不代表全站所有内容可下载",
    pPartialHint: "已有成功样例，也存在未通过的场景，详见限制",
    pPlannedHint: "已列入后续验证计划，当前不承诺解析或下载",
    pOpenMaterial: "去素材获取",
    pOpenBrowser: "打开官网",
    pGoParser: "解析链接",
    pBrowserHint: "使用系统默认浏览器打开官网",
    pMaterialHint: "在素材获取中浏览官网，遵循独立窗口设置",
    pParserHint: "前往工作台粘贴具体内容链接",
    pEmpty: "没有符合条件的平台",
    pEmptyHint: "换个搜索词，或重置筛选条件。",
    pReset: "重置筛选",
    pCapability: "已验证资源",
    pPlannedCapability: "拟验证资源",
    pBoundary: "使用限制",
    pLoginRule: "访问方式",
    pAnonymous: "公开匿名样例；未使用浏览器 Cookie",
    pChecked: "最近验证",
    pReadyGroup: "当前支持范围",
    pPlannedGroup: "后续验证计划",
    pScope:
      "已验证与部分支持基于实际样例；未实测的网站仅由引擎列出。展开使用说明可查看限制。",
    pResults: "{{count}} 个平台",
    pOpenFailed: "打开失败，请重试",
    pBilibili: "哔哩哔哩",
    pYoutube: "YouTube",
    pX: "X",
    pInstagram: "Instagram",
    pDouyin: "抖音",
    pXiaohongshu: "小红书",
    pBatchTitle: "批量样例检查",
    pBatchHint: "本轮公开链接的解析结果；数字表示通过数 / 样例数。",
    pBatchParsed: "解析 {{passed}} / {{total}}",
    pBatchDownloaded: "另有下载样例",
    pBatchBoundary:
      "下载标记来自此前的独立样例，与本轮解析样例不同；其他平台本轮只测解析。单条结果不代表整站。",
    pEvidence_bilibili:
      "普通视频、旧版链接与分 P 样例通过视频、原音频、MP3 和封面下载。",
    pEvidence_youtube:
      "公开视频、Shorts 和分享链接已有解析、播放及下载成功样例。",
    pEvidence_x:
      "公开帖子已验证单视频、多视频、单图与图集；有声视频支持音频与封面。",
    pEvidence_instagram: "公开 Reel、视频帖、三视频帖与原图已有成功样例。",
    pEvidence_douyin:
      "新增公开视频短链通过下载、同作品重试和混合批量；保留既有音频与封面样例。",
    pEvidence_xiaohongshu:
      "15图作品通过选图下载和同图重试；一条.cn短链图片下载通过，另有既有视频样例。",
    pLimit_bilibili:
      "活动页重定向样例未通过。登录、会员及清晰度限制由来源决定。",
    pLimit_youtube:
      "匿名请求可能触发机器人验证；长片完整下载曾超过测试时限，失效样例不可用。",
    pLimit_x:
      "历史 twitter.com / Amplify 外链样例未通过；部分帖子使用匿名备用路线，私有内容不在验证范围。",
    pLimit_instagram:
      "仅代表已测公开样例，账号、私密内容与全集未验证；三视频帖的封面未单独复测。",
    pLimit_douyin:
      "匿名备用路线提供一档视频；图文适配仍属实验，线上样例未通过。直播与更多作品待测。",
    pLimit_xiaohongshu:
      "短链仅验证一个成功样例，其他短链可能需要登录或已失效。保留完整分享参数，图片为平台提供的版本。",
  },
  en: {
    ...platformShortcutTranslations.en,
    pNav: "Platforms",
    pTitle: "Supported platforms",
    pSubtitle: "Explore sources, media types and tested coverage",
    pSearch: "Search names or aliases",
    pRegion: "Region",
    pMedia: "Media",
    pStatus: "Status",
    pAll: "All",
    pDomestic: "China",
    pOverseas: "Global",
    pVideo: "Video",
    pAudio: "Audio",
    pImage: "Post images",
    pCover: "Cover",
    pVerified: "Sample-tested",
    pPartial: "Partial",
    pPlanned: "To be tested",
    pVerifiedHint:
      "Listed public samples passed; this does not cover all content",
    pPartialHint: "Some samples passed and some cases failed; see limits",
    pPlannedHint:
      "Planned for testing; parsing and downloads are not confirmed",
    pOpenMaterial: "Media browser",
    pOpenBrowser: "Open website",
    pGoParser: "Parse link",
    pBrowserHint: "Open website in the default browser",
    pMaterialHint: "Browse the website using your separate-window preference",
    pParserHint: "Paste a specific content link in the workbench",
    pEmpty: "No matching platforms",
    pEmptyHint: "Try another search or reset the filters.",
    pReset: "Reset filters",
    pCapability: "Tested media",
    pPlannedCapability: "Planned media",
    pBoundary: "Limits",
    pLoginRule: "Access",
    pAnonymous: "Public anonymous samples; no browser cookies",
    pChecked: "Last tested",
    pReadyGroup: "Current coverage",
    pPlannedGroup: "Planned testing",
    pScope:
      "Tested and partial statuses reflect samples; untested sites are engine-listed only. Expand Details for limitations.",
    pResults: "{{count}} platforms",
    pOpenFailed: "Could not open. Please retry.",
    pBilibili: "Bilibili",
    pYoutube: "YouTube",
    pX: "X",
    pInstagram: "Instagram",
    pDouyin: "Douyin",
    pXiaohongshu: "Xiaohongshu",
    pBatchTitle: "Batch sample checks",
    pBatchHint:
      "Public-link parsing in this batch; counts show passed / tested.",
    pBatchParsed: "Parsed {{passed}} / {{total}}",
    pBatchDownloaded: "Download sample tested separately",
    pBatchBoundary:
      "Download badges refer to earlier, separate samples. Other platforms were only parsed in this batch. Results do not cover every post.",
    pEvidence_bilibili:
      "Regular, legacy and multi-part video samples passed video, original audio, MP3 and cover downloads.",
    pEvidence_youtube:
      "Public videos, Shorts and shared links have successful parsing, playback and download samples.",
    pEvidence_x:
      "Public posts tested for single/multiple videos and images. Videos with sound support audio and covers.",
    pEvidence_instagram:
      "Public Reels, video posts, a three-video post and original photos have passed samples.",
    pEvidence_douyin:
      "A new public video short link passed download, exact-post retry and mixed batches. Earlier audio and cover samples remain recorded.",
    pEvidence_xiaohongshu:
      "Selected images from a 15-image post passed download and retry. One .cn short-link image passed; earlier video samples remain recorded.",
    pLimit_bilibili:
      "A festival redirect failed. Login, membership and quality limits depend on the source.",
    pLimit_youtube:
      "Anonymous requests may trigger bot checks. A full long-video download exceeded the test timeout; expired content is unavailable.",
    pLimit_x:
      "A legacy twitter.com / Amplify link failed. Some posts use the anonymous fallback; private content is untested.",
    pLimit_instagram:
      "Public samples only. Accounts, private content and full collections are untested; covers of the three-video post were not retested.",
    pLimit_douyin:
      "The anonymous fallback offers one video format. Image-post support is experimental; online samples failed. Live streams and further posts are untested.",
    pLimit_xiaohongshu:
      "Only one short-link sample passed; others may require login or be unavailable. Keep full share parameters. Images are platform-provided versions.",
  },
  "zh-TW": {
    ...platformShortcutTranslations["zh-TW"],
    pNav: "支援平台",
    pTitle: "支援平台",
    pSubtitle: "從平台出發，查看可取得的資源與驗證範圍",
    pSearch: "搜尋平台名稱或別名",
    pRegion: "地區",
    pMedia: "資源類型",
    pStatus: "支援狀態",
    pAll: "全部",
    pDomestic: "國內",
    pOverseas: "海外",
    pVideo: "影片",
    pAudio: "音訊",
    pImage: "貼文圖片",
    pCover: "封面",
    pVerified: "範例已驗證",
    pPartial: "部分支援",
    pPlanned: "待驗證",
    pVerifiedHint: "列出的公開範例已通過，不代表全站所有內容皆可下載",
    pPartialHint: "已有成功範例，也存在未通過的情境，請見限制",
    pPlannedHint: "已列入後續驗證計畫，目前不承諾解析或下載",
    pOpenMaterial: "前往素材取得",
    pOpenBrowser: "開啟官網",
    pGoParser: "解析連結",
    pBrowserHint: "使用系統預設瀏覽器開啟官網",
    pMaterialHint: "在素材取得中瀏覽官網，依照獨立視窗設定",
    pParserHint: "前往工作台貼上特定內容連結",
    pEmpty: "沒有符合條件的平台",
    pEmptyHint: "換個搜尋詞，或重設篩選條件。",
    pReset: "重設篩選",
    pCapability: "已驗證資源",
    pPlannedCapability: "擬驗證資源",
    pBoundary: "使用限制",
    pLoginRule: "存取方式",
    pAnonymous: "公開匿名範例；未使用瀏覽器 Cookie",
    pChecked: "最近驗證",
    pReadyGroup: "目前支援範圍",
    pPlannedGroup: "後續驗證計畫",
    pScope:
      "已驗證與部分支援以實際範例為準；未實測網站僅由引擎列出。展開使用說明可查看限制。",
    pResults: "{{count}} 個平台",
    pOpenFailed: "開啟失敗，請重試",
    pBilibili: "嗶哩嗶哩",
    pYoutube: "YouTube",
    pX: "X",
    pInstagram: "Instagram",
    pDouyin: "抖音",
    pXiaohongshu: "小紅書",
    pBatchTitle: "批次範例檢查",
    pBatchHint: "本次公開連結的解析結果；數字表示通過數 / 範例數。",
    pBatchParsed: "解析 {{passed}} / {{total}}",
    pBatchDownloaded: "另有下載範例",
    pBatchBoundary:
      "下載標記來自先前的獨立範例，與本次解析範例不同；其他平台本次只測解析。單一結果不代表整站。",
    pEvidence_bilibili:
      "一般影片、舊版連結與分 P 範例通過影片、原始音訊、MP3 與封面下載。",
    pEvidence_youtube:
      "公開影片、Shorts 與分享連結已有解析、播放及下載成功範例。",
    pEvidence_x:
      "公開貼文已驗證單一影片、多影片、單圖與圖集；有聲影片支援音訊與封面。",
    pEvidence_instagram: "公開 Reel、影片貼文、三影片貼文與原圖已有成功範例。",
    pEvidence_douyin:
      "新增公開影片短連結通過下載、同作品重試與混合批次；保留既有音訊及封面範例。",
    pEvidence_xiaohongshu:
      "15圖作品通過選圖下載與同圖重試；一則.cn短連結圖片下載通過，另有既有影片範例。",
    pLimit_bilibili:
      "活動頁重新導向範例未通過。登入、會員及畫質限制由來源決定。",
    pLimit_youtube:
      "匿名請求可能觸發機器人驗證；長片完整下載曾超過測試時限，失效範例無法使用。",
    pLimit_x:
      "歷史 twitter.com / Amplify 外部連結範例未通過；部分貼文使用匿名備援路線，私人內容不在驗證範圍。",
    pLimit_instagram:
      "僅代表已測公開範例，帳號、私人內容與全集未驗證；三影片貼文的封面未單獨複測。",
    pLimit_douyin:
      "匿名備用路線提供一種影片格式；圖文適配仍屬實驗，線上範例未通過。直播與更多作品待測。",
    pLimit_xiaohongshu:
      "短連結僅驗證一個成功範例，其他可能需要登入或已失效。保留完整分享參數，圖片為平台提供的版本。",
  },
  ja: {
    ...platformShortcutTranslations.ja,
    pNav: "対応サイト",
    pTitle: "対応プラットフォーム",
    pSubtitle: "配信元ごとの取得可能なメディアと検証範囲を確認",
    pSearch: "名前・別名で検索",
    pRegion: "地域",
    pMedia: "メディア",
    pStatus: "状態",
    pAll: "すべて",
    pDomestic: "中国",
    pOverseas: "海外",
    pVideo: "動画",
    pAudio: "音声",
    pImage: "投稿画像",
    pCover: "サムネイル",
    pVerified: "サンプル検証済み",
    pPartial: "一部対応",
    pPlanned: "検証予定",
    pVerifiedHint:
      "公開サンプルで確認済み。すべてのコンテンツへの対応を示すものではありません",
    pPartialHint: "成功例と未対応の例があります。制限事項をご確認ください",
    pPlannedHint: "今後検証予定。解析・ダウンロードへの対応は未確認です",
    pOpenMaterial: "素材ブラウザー",
    pOpenBrowser: "公式サイト",
    pGoParser: "リンクを解析",
    pBrowserHint: "既定のブラウザーで公式サイトを開く",
    pMaterialHint: "別ウィンドウ設定に従って素材ブラウザーで開く",
    pParserHint: "ワークベンチでコンテンツのリンクを貼り付け",
    pEmpty: "一致するサイトがありません",
    pEmptyHint: "検索語を変えるか、フィルターをリセットしてください。",
    pReset: "リセット",
    pCapability: "検証済みメディア",
    pPlannedCapability: "検証予定メディア",
    pBoundary: "制限事項",
    pLoginRule: "アクセス",
    pAnonymous: "公開サンプルで匿名検証。ブラウザーの Cookie は未使用",
    pChecked: "最終検証",
    pReadyGroup: "現在の対応範囲",
    pPlannedGroup: "今後の検証予定",
    pScope:
      "検証済み・一部対応はサンプルに基づきます。未検証サイトはエンジン掲載のみです。制限は利用案内で確認できます。",
    pResults: "{{count}} サイト",
    pOpenFailed: "開けませんでした。再試行してください。",
    pBilibili: "ビリビリ",
    pYoutube: "YouTube",
    pX: "X",
    pInstagram: "Instagram",
    pDouyin: "Douyin",
    pXiaohongshu: "小紅書",
    pBatchTitle: "サンプル一括検証",
    pBatchHint: "今回の公開リンク解析結果。数値は成功数 / サンプル数です。",
    pBatchParsed: "解析 {{passed}} / {{total}}",
    pBatchDownloaded: "別サンプルで取得検証済み",
    pBatchBoundary:
      "取得マークは今回とは別の過去のサンプルに基づきます。他は今回解析のみ検証。全投稿の成功を保証しません。",
    pEvidence_bilibili:
      "通常・旧形式・分割動画で動画、元音声、MP3、サムネイルの取得を検証済み。",
    pEvidence_youtube:
      "公開動画、Shorts、共有リンクで解析・再生・取得の成功例があります。",
    pEvidence_x:
      "公開投稿の単一・複数動画、単一・複数画像を検証済み。有声動画では音声とサムネイルも取得可能。",
    pEvidence_instagram:
      "公開 Reel、動画投稿、3 本の動画を含む投稿、元画像の成功例があります。",
    pEvidence_douyin:
      "新しい公開動画の短縮リンクで取得・同一投稿の再試行・混合一括処理を検証。以前の音声・カバーの記録も保持。",
    pEvidence_xiaohongshu:
      "15枚の投稿から選択画像の取得と再試行、.cn短縮リンク1件の画像取得を検証。以前の動画記録も保持。",
    pLimit_bilibili:
      "イベントページへの転送例は失敗。ログイン・会員・画質の制限は配信元によります。",
    pLimit_youtube:
      "匿名アクセスで bot 確認が発生する場合があります。長編の取得はテスト時間を超過した例があり、失効動画は取得不可。",
    pLimit_x:
      "旧 twitter.com / Amplify の外部リンク例は失敗。一部は匿名代替ルートを使用。非公開内容は未検証。",
    pLimit_instagram:
      "公開サンプルのみ。アカウント全体・非公開内容・コレクションは未検証。3 動画投稿のサムネイルは未再検証。",
    pLimit_douyin:
      "匿名経路は1種類の動画形式を提供。画像投稿は実験段階で、オンライン例は失敗。ライブなどは未検証。",
    pLimit_xiaohongshu:
      "短縮リンクの成功例は1件のみ。他はログインが必要、または利用不可の場合があります。共有パラメータを保持。画像は配信元の提供版です。",
  },
  ko: {
    ...platformShortcutTranslations.ko,
    pNav: "지원 플랫폼",
    pTitle: "지원 플랫폼",
    pSubtitle: "출처별 다운로드 가능한 미디어와 검증 범위 확인",
    pSearch: "이름 또는 별칭 검색",
    pRegion: "지역",
    pMedia: "미디어",
    pStatus: "상태",
    pAll: "전체",
    pDomestic: "중국",
    pOverseas: "해외",
    pVideo: "동영상",
    pAudio: "오디오",
    pImage: "게시물 이미지",
    pCover: "커버",
    pVerified: "샘플 검증 완료",
    pPartial: "부분 지원",
    pPlanned: "검증 예정",
    pVerifiedHint:
      "공개 샘플로 확인했으며 모든 콘텐츠의 다운로드를 보장하지 않습니다",
    pPartialHint: "성공 사례와 실패 사례가 있습니다. 제한 사항을 확인하세요",
    pPlannedHint:
      "향후 검증 예정이며 현재 분석·다운로드 지원은 확인되지 않았습니다",
    pOpenMaterial: "소재 브라우저",
    pOpenBrowser: "공식 사이트",
    pGoParser: "링크 분석",
    pBrowserHint: "기본 브라우저에서 공식 사이트 열기",
    pMaterialHint: "별도 창 설정에 따라 소재 브라우저에서 열기",
    pParserHint: "작업대에서 콘텐츠 링크 붙여넣기",
    pEmpty: "일치하는 플랫폼이 없습니다",
    pEmptyHint: "검색어를 바꾸거나 필터를 초기화하세요.",
    pReset: "필터 초기화",
    pCapability: "검증된 미디어",
    pPlannedCapability: "검증 예정 미디어",
    pBoundary: "제한 사항",
    pLoginRule: "접근 방식",
    pAnonymous: "공개 샘플 익명 검증; 브라우저 Cookie 미사용",
    pChecked: "최근 검증",
    pReadyGroup: "현재 지원 범위",
    pPlannedGroup: "향후 검증 계획",
    pScope:
      "검증 및 부분 지원은 실제 샘플 기준이며, 미검증 사이트는 엔진에만 등록되어 있습니다. 사용 안내를 펼쳐 제한을 확인하세요.",
    pResults: "플랫폼 {{count}}개",
    pOpenFailed: "열 수 없습니다. 다시 시도하세요.",
    pBilibili: "빌리빌리",
    pYoutube: "YouTube",
    pX: "X",
    pInstagram: "Instagram",
    pDouyin: "Douyin",
    pXiaohongshu: "샤오홍슈",
    pBatchTitle: "일괄 샘플 검사",
    pBatchHint: "이번 공개 링크 분석 결과이며 숫자는 성공 / 샘플 수입니다.",
    pBatchParsed: "분석 {{passed}} / {{total}}",
    pBatchDownloaded: "별도 다운로드 샘플 확인",
    pBatchBoundary:
      "다운로드 표시는 이번과 다른 이전 샘플 기준입니다. 다른 플랫폼은 이번에 분석만 검사했으며 모든 게시물을 보장하지 않습니다.",
    pEvidence_bilibili:
      "일반·기존·분할 동영상 샘플에서 동영상, 원본 오디오, MP3와 커버 다운로드를 검증했습니다.",
    pEvidence_youtube:
      "공개 동영상, Shorts와 공유 링크의 분석·재생·다운로드 성공 사례가 있습니다.",
    pEvidence_x:
      "공개 게시물의 단일·다중 동영상과 이미지를 검증했습니다. 소리가 있는 동영상은 오디오와 커버도 지원합니다.",
    pEvidence_instagram:
      "공개 Reel, 동영상 게시물, 동영상 3개 게시물과 원본 이미지 성공 사례가 있습니다.",
    pEvidence_douyin:
      "새 공개 동영상 단축 링크의 다운로드, 동일 게시물 재시도와 혼합 일괄 처리를 검증했습니다. 기존 오디오·표지 기록도 유지합니다.",
    pEvidence_xiaohongshu:
      "15장 게시물의 선택 이미지 다운로드·재시도와 .cn 단축 링크 1개의 이미지 다운로드를 검증했습니다. 기존 동영상 기록도 유지합니다.",
    pLimit_bilibili:
      "이벤트 페이지 리디렉션 샘플은 실패했습니다. 로그인·멤버십·화질 제한은 출처에 따릅니다.",
    pLimit_youtube:
      "익명 요청 시 봇 확인이 발생할 수 있습니다. 긴 동영상 전체 다운로드가 테스트 시간을 초과한 사례가 있으며 만료된 콘텐츠는 사용할 수 없습니다.",
    pLimit_x:
      "기존 twitter.com / Amplify 외부 링크 샘플은 실패했습니다. 일부 게시물은 익명 대체 경로를 사용하며 비공개 콘텐츠는 미검증입니다.",
    pLimit_instagram:
      "공개 샘플만 검증했습니다. 계정 전체·비공개 콘텐츠·컬렉션은 미검증이며, 3개 동영상 게시물의 커버는 재검증하지 않았습니다.",
    pLimit_douyin:
      "익명 경로는 동영상 형식 1개를 제공합니다. 이미지 게시물은 실험 단계이며 온라인 샘플은 실패했습니다. 라이브 등은 미검증입니다.",
    pLimit_xiaohongshu:
      "단축 링크 성공 샘플은 1개뿐이며 다른 링크는 로그인 필요 또는 만료 상태일 수 있습니다. 공유 매개변수를 유지하세요. 이미지는 플랫폼 제공 버전입니다.",
  },
} as const;
