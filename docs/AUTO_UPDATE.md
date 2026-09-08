# 自动更新与本轮界面调整

## 已实现

- “播放最多”去掉歌曲时长列；保留播放次数，使用与最近添加相同的容器断点隐藏日期和专辑，不再强制 880px 最小宽度。
- 歌曲表格右上角提供文件夹多选，默认全部；筛选与搜索相交。零结果时仍保留筛选入口。目录匹配包含子目录，并排除同名前缀的相邻目录。
- 首页封面左边缘与推荐列表对齐，去掉投影；优先显示当前文案关联歌曲的专辑封面，没有封面时使用海面、月夜、日出三种内置 SVG。重新进入首页重新选择文案。
- 歌单副标题只保留歌曲数量与总时长。
- 桌面启动 5 秒后自动检查，并每 6 小时再检查；设置页支持手动检查、下载进度、错误重试、安装和重启。自动检查失败不弹窗打断播放。安装前保存应用状态，更新签名由 Tauri 官方 updater 插件强制校验。

## 发布链路

客户端读取 `https://github.com/maweifeng2024/nanoPlayer/releases/latest/download/latest.json`。

GitHub Actions 构建时，`scripts/release/tauri-build.mjs` 检查签名私钥并启用 `createUpdaterArtifacts`。发布前 `create-updater-manifest.mjs` 要求 macOS universal 的 `.app.tar.gz`、Windows x64 的 `.exe`、Linux x64 的 `.AppImage` 及各自 `.sig` 全部存在，生成四个架构入口，随安装包一同上传 Release。缺包或缺签名时发布失败。平台代码签名/公证与更新签名是独立事项。

签名公钥已存入 `src-tauri/tauri.conf.json`。本轮生成的私钥保存在项目 `.release-keys/updater.key`（目录 700、私钥 600、已被 Git 忽略）；须安全备份并保持与公钥配套，不能在后续发布时随意重新生成。GitHub Secret 名称为 `TAURI_SIGNING_PRIVATE_KEY`；本轮密钥无口令，工作流中的可选 password secret 保持为空。

## 尚未完成的外部步骤

用户已明确授权保存私钥；2026-09-08 15:36（北京时间）已将 `TAURI_SIGNING_PRIVATE_KEY` 保存到 `maweifeng2024/nanoPlayer` 的 GitHub Actions 加密 Secret，并通过名称与更新时间验证成功，未输出私钥内容。本轮没有提交、打标签或发布新版本；当前最新 Release 尚未提供该客户端需要的更新清单。发布包含本轮修改的新版本后，才可进行真实跨版本升级验收。原来未带 updater 的旧客户端，需要先手动安装首个支持更新的版本。

正式升级验收：旧版本检查到新版本 → 下载 → 签名验证 → 安装 → 重启 → 核对版本和队列/位置/歌单/评分，分别验收 macOS、Windows、Linux。浏览器 mock 测试不代表这条原生升级路径已经验收。

## 本轮验证

- `pnpm check`：30 项单元测试、lint、TypeScript 和前端构建通过。
- `pnpm test:e2e`：23 项通过，含多选、零结果恢复、搜索相交、720/900/1100/1440px 布局与首页左对齐。
- `cargo check`、`cargo fmt --check` 通过；Rust 测试 15 项通过，2 项显式联网/性能测试按原配置忽略。
- `node --test scripts/release/create-updater-manifest.test.mjs` 验证清单平台映射、URL 编码与缺签名失败。
- `pnpm tauri build --debug --bundles app` 已生成本地 macOS 应用包。
- 原生应用实测：全部 4034 首 → 单文件夹 3119 首 → 恢复所有文件夹；首页能加载真实专辑封面，切回首页文案与图片随之更换；更新插件返回远端清单获取失败（尚未发布清单），未发生权限错误。

## 发布恢复（2026-09-08）

v0.1.6 的三个平台构建均成功，但 `publish` 在生成更新清单时报 `Expected one .app.tar.gz updater artifact, found 0`，官网作业随之被跳过。原因是 Actions 保留了 bundle 子目录，而清单生成器只扫描顶层，且原先整理目录的校验和脚本排在它之后。

已将递归发现、同名冲突检查与顶层副本整理合并为共享函数，生成更新清单之前即运行；新增真实嵌套目录、重复运行及来源验证测试。正常标签构建与恢复共用 `publish-release.yml`，确保恢复也使用完整的上传、Vercel 部署和线上验证链路。

恢复命令：`pnpm release --resume v0.1.6`。它不改版本、不打新标签，调用 main 上已提交的最新发布脚本，复用该标签原始构建的三平台产物；验证来源仓库、标签提交、成功作业及产物未过期。普通发布失败后，不要直接重跑旧提交的失败任务来验证新脚本；先提交修复，再使用恢复命令。官网清单在部署并验证后才回写 main，避免回写冲突阻断部署。
