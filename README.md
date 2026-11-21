<div align="center">
  <img src="docs/assets/nyacatch.png" width="96" alt="NyaCatch 喵拾图标" />
  <h1>NyaCatch · 喵拾</h1>
  <p>下载素材，整理资源，处理音视频。</p>
  <p>基于 MediaGo 的 Windows 桌面工具，集成链接下载、网页素材提取与本地媒体处理。</p>
  <p>
    <img src="https://img.shields.io/badge/version-0.23.0--beta.1-F2CA46?labelColor=242A36" alt="0.23.0-beta.1" />
    <img src="https://img.shields.io/badge/platform-Windows_11-242A36" alt="已在 Windows 11 验证" />
    <a href="LICENSE"><img src="https://img.shields.io/badge/source_license-MIT-242A36" alt="源码 MIT 许可证" /></a>
  </p>
  <p>
    <a href="#下载与安装">下载与安装</a> ·
    <a href="#主要功能">主要功能</a> ·
    <a href="#界面预览">界面预览</a> ·
    <a href="#版本更新">版本更新</a> ·
    <a href="https://github.com/kuroii07/NyaCatch/issues">问题反馈</a>
  </p>
</div>

## 下载与安装

**当前版本为 `0.23.0-beta.1`，处于开发内测阶段。这个仓库目前提供源码，尚未发布可供公众下载的安装包。**

后续安装包将在 [NyaCatch Releases](https://github.com/kuroii07/NyaCatch/releases) 提供；发布时会附上文件名、版本、文件大小、SHA256 与签名状态。上游 MediaGo 的安装包与喵拾不同，请以本仓库的发布说明为准。

目前已在 Windows 11 验证。其他 Windows 版本、macOS 与 Linux 尚未完成喵拾的运行验收。

## 主要功能

### 下载与素材提取

- **链接解析与下载**：粘贴链接或分享文本，选择实际可用的画质、音频、封面和已支持的图片资源。
- **批量解析**：最多 20 条不同链接，逐项重试和选择资源，确认后再加入队列或开始下载。
- **合集与选集**：支持已适配的 B 站 BV 多分 P、UP 主公开合集与 YouTube 公开播放列表，按集选择并分别创建任务。
- **网页素材提取**：内置浏览器、常用国内外网站入口与手动收藏；捕获资源通过默认收起的抽屉展示。
- **任务管理**：查看进度、筛选、多选、停止及重试；下载结果可继续发送到本地处理功能。

解析规则收录不代表每个网站都经过实测，也不保证平台任意内容都能下载。登录、地区、版权及平台访问限制仍然适用；部分公开帖子适配仍在实验阶段。详情见 [功能范围](docs/nyacatch/support.md)。

### 本地音视频处理

- **格式转换**：视频、音频与静态图片转换，视频尺寸按源文件限制，保持比例缩小，避免无意义放大。
- **音频提取**：直接复制首条原音轨，自动选择兼容格式；也可转换为常用音频格式。
- **片段截取**：大画面预览、标记入点与出点，一个文件最多选择 20 个片段并分别导出。
- **音视频拼接**：排序并合并 2～20 个同类文件，视频和纯音频分别提供输出设置。
- **视频截帧 / GIF**：定位导出 PNG/JPG/WebP，选择片段制作 GIF，支持常用像素尺寸与源帧率。
- **视频压制**：H.264/H.265、CPU 或受支持的 NVIDIA NVENC、CRF/CQ、目标体积两遍编码与短片试压；支持 SRT/ASS 字幕烧录和静帧预览。
- **视频封装**：MP4/MKV/MOV/TS 无损换封装，以及视频、可选音频和字幕合并。音视频直接复制，兼容检查后另存；MKV 支持 SRT/ASS 软字幕，MP4/MOV 的新增 SRT 需明确允许转换。

本地处理默认保留原文件，同名输出自动另存。不同功能的处理记录分别展示，草稿和不确定提交状态可以恢复。格式兼容性取决于内部编码，封装不会提高画质。

### 外观与使用体验

六套主题、浅色 / 深色 / 跟随系统，支持简体中文、繁体中文、English、日本語与한국어。侧栏可以收起，输入框支持鼠标右键编辑，设置与常用工作草稿保存在本机。

## 界面预览

以下为 `0.23.0-beta.1` 隔离环境实机截图，未使用个人任务或下载数据。

![链接下载工作台](docs/screenshots/workbench.png)

<details>
  <summary>查看视频封装与视频压制</summary>

![视频、音频与字幕合并封装](docs/screenshots/mux.png)

![视频压制](docs/screenshots/compress.png)

</details>

## 版本更新

- **0.23.0-beta.1**：合并封装增加 SRT/ASS 独立软字幕轨，支持视频＋音频、视频＋字幕与三文件组合。保留原字幕，不选外部音频时保留原音轨。[更新说明](docs/nyacatch/0.23.0-beta.1.md)
- **0.22.0-beta.1**：新增独立视频封装页，支持无损换封装、外部音频替换、逐轨兼容检查与独立记录。[更新说明](docs/nyacatch/0.22.0-beta.1.md)
- **0.21.0-beta.1**：视频压制增加 NVIDIA NVENC、CQ 与硬件能力检测，保留 CPU 目标体积两遍编码。[更新说明](docs/nyacatch/0.21.0-beta.1.md)

更早的功能说明见 [版本索引](docs/nyacatch/README.md)。

## 发布与更新

开发阶段继续使用本机交付流程；正式版计划接入 **本仓库** 的 GitHub Releases 自动更新。目前没有面向公众的在线自动更新，也不会安装上游 MediaGo 的更新。

本次上传源码不创建 Release、不上传安装包、不部署网站。开发与源码目录说明见 [开发文档](docs/nyacatch/development.md)。

## 技术与致谢

喵拾基于 [MediaGo](https://github.com/mediago-dev/mediago) 的 3.5.0 源码基线继续开发，保留上游署名、许可证与基线来源。主要技术为 Electron、React、TypeScript、Go、FFmpeg 与 yt-dlp。

感谢 [FFmpeg](https://ffmpeg.org/)、[yt-dlp](https://github.com/yt-dlp/yt-dlp)、[N_m3u8DL-RE](https://github.com/nilaoda/N_m3u8DL-RE)、[BBDown](https://github.com/nilaoda/BBDown)、[aria2](https://github.com/aria2/aria2) 及其他开源依赖的开发者。它们的许可证与分发要求分别适用。

源码保留上游 [MIT LICENSE](LICENSE)。上游历史文档另有非商业用途表述，本项目不对其冲突作额外授权解释；商业使用或分发前请与上游确认，并核对所附第三方组件的许可证。请只处理你有权下载或使用的内容，遵守当地法律和平台规则。
