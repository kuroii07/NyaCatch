export const converterTranslations = {
  zh: {
    cvVideo: "视频",
    cvAudio: "音频",
    cvImage: "图片",
    cvHint:
      "输出保存在原文件旁，重名自动另存，不覆盖原文件。图片转换只保留第一帧；JPG 不保留透明度。",
    cvMaxFiles: "每次最多选择 20 个文件。",
    cvSelected: "已选择 {{count}} 个文件",
    cvPartial:
      "已添加 {{added}} 项，{{failures}} 项添加或启动失败，请检查列表。",
    cvAdded: "已添加 {{count}} 项",
    cvConvertPage: "转换本页待处理",
  },
  en: {
    cvVideo: "Video",
    cvAudio: "Audio",
    cvImage: "Image",
    cvHint:
      "Outputs are saved beside originals with unique names. Image conversion keeps the first frame; JPG does not preserve transparency.",
    cvMaxFiles: "Select up to 20 files at a time.",
    cvSelected: "{{count}} files selected",
    cvPartial:
      "Added {{added}}; {{failures}} failed to add or start. Check the list.",
    cvAdded: "Added {{count}}",
    cvConvertPage: "Convert pending on page",
  },
  "zh-TW": {
    cvVideo: "影片",
    cvAudio: "音訊",
    cvImage: "圖片",
    cvHint:
      "輸出儲存在原檔旁，重名自動另存，不覆蓋原檔。圖片轉換只保留第一幀；JPG 不保留透明度。",
    cvMaxFiles: "每次最多選擇 20 個檔案。",
    cvSelected: "已選擇 {{count}} 個檔案",
    cvPartial:
      "已新增 {{added}} 項，{{failures}} 項新增或啟動失敗，請檢查清單。",
    cvAdded: "已新增 {{count}} 項",
    cvConvertPage: "轉換本頁待處理",
  },
  ja: {
    cvVideo: "動画",
    cvAudio: "音声",
    cvImage: "画像",
    cvHint:
      "出力は元ファイルの横に別名で保存し、上書きしません。画像変換は先頭フレームのみ。JPG は透明度を保持しません。",
    cvMaxFiles: "一度に選べるのは 20 ファイルまでです。",
    cvSelected: "{{count}} ファイルを選択",
    cvPartial:
      "{{added}} 件追加、{{failures}} 件の追加または開始に失敗しました。リストを確認してください。",
    cvAdded: "{{count}} 件追加しました",
    cvConvertPage: "このページの未処理を変換",
  },
  ko: {
    cvVideo: "동영상",
    cvAudio: "오디오",
    cvImage: "이미지",
    cvHint:
      "결과는 원본 옆에 다른 이름으로 저장하며 덮어쓰지 않습니다. 이미지 변환은 첫 프레임만 보존하고 JPG는 투명도를 보존하지 않습니다.",
    cvMaxFiles: "한 번에 최대 20개 파일을 선택하세요.",
    cvSelected: "파일 {{count}}개 선택됨",
    cvPartial:
      "{{added}}개 추가, {{failures}}개 추가 또는 시작 실패. 목록을 확인하세요.",
    cvAdded: "{{count}}개 추가됨",
    cvConvertPage: "현재 페이지 대기 항목 변환",
  },
} as const;
