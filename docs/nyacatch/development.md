# 开发与源码说明

本仓库为NyaCatch桌面项目的源码仓库，基于MediaGo 3.5.0，产品版本统一读取`packages/shared/common/src/constants/branding.ts`中的`APP_BUILD_VERSION`。上游各工作区的包版本和内部APP_NAME继续独立保留，不要用改内部标识的方式升级产品或迁移数据。

## 环境与目录

主要依赖Node.js、pnpm 10.15.0和Go，桌面基于Electron 41与React。具体Go版本、依赖与命令以`apps/core/go.mod`、根`package.json`和锁文件为准。

- `apps/ui/`：React界面、主题、五语与工作区状态。
- `apps/electron/`：桌面窗口、受控IPC、文件能力与打包。
- `apps/core/`：Go核心、下载解析、媒体处理与任务数据库。
- `packages/`：共享类型、常量、SDK与运行服务。
- `scripts/`：依赖准备、解析规则生成及构建脚本。
- `docs/nyacatch/`：喵拾功能说明与版本记录。
- `extra/aria2/`：上游构建脚本依赖的跨平台aria2供应文件，按原布局保留；本机下载的其他运行依赖不纳入Git。

## 开发入口

```sh
pnpm install --frozen-lockfile
pnpm deps:download
pnpm dev:electron
```

Windows PowerShell若拦截`.ps1`命令，可使用`pnpm.cmd`，不需要修改全局执行策略。

依赖准备可能访问第三方GitHub Releases；构建前应核对版本与许可证。源码内的`.env`文件是无密钥的上游默认值；私有覆盖值只能放被忽略的`*.local`文件，不得提交Token、Cookie、账号数据或私钥。

## 检查

根脚本提供`pnpm lint`、`pnpm format:check`与`pnpm type:check`。Go测试位于`apps/core`，可执行`go test ./...`；需要真实FFmpeg的媒体测试必须设置`NYACATCH_TEST_FFMPEG`，未配置时相关测试会跳过，不能据此声明真实输出通过。

工作区中使用`tsx --test`执行相关`*.test.ts`，按本次修改范围选择测试。不要为了清除提示改写安全敏感的逐项建单与确认顺序。

本机开发交付和屏幕外目录包验收工具位于维护工作区，不包含在此源码仓库；`deliver:local`属于该维护环境，普通克隆不应直接运行。完整源码构建不等同于已通过公众发行验收。

## 构建与发布边界

`pnpm core:build`和`pnpm build:electron`构建核心与桌面代码。实际打包逻辑在`apps/electron/scripts/build.ts`，开发内测使用`--dir --beta`，不连接上游发布源。

正式版本使用同一产品版本常量；Windows运行环境中执行`pnpm release:electron`可构建NSIS安装器，`pnpm pack:electron`仅构建目录包，产物位于`apps/electron/release/`。打包器固定本仓库`kuroii07/NyaCatch`作为更新源，构建时`publish: never`，不会自动上传。上传Release须单独授权并核对tag与资产，勿向上游发布位置上传。上游CI工作流不自动适用于本仓库。

安装版通过安装目录内的`Uninstall NyaCatch.exe`识别，配置/任务放在`%APPDATA%/NyaCatch`；免安装版在旁置`data/`。仅正式安装版启用GitHub更新，更新IPC仅接受主窗口主frame。下载完成后需用户确认，安装前核验活动任务、预览租约和数据备份，退出时不自动安装。

随包`resources/licenses/`记录实际原生工具、npm依赖及编译Go模块的许可证和来源。发布时同时提供`NyaCatch-<版本>-third-party-sources.zip`，含清单中固定ref的原生工具与MPL组件源码、FFmpeg配置和来源记录；具体构建依赖以源码中的`licenses/source-manifest.json`和`licenses/FFmpeg-build-provenance.txt`为准。资料用于说明来源和构建条件，不承诺位级可重现。

提交源码时排除依赖、运行数据、日志、缓存、构建目录与本机程序包；保留源码、锁文件、许可证、公共组件资源和构建所需配置。README首页面向使用者，开发细节集中在本文。
