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

## 发布与升级验收状态

`TAURI_SIGNING_PRIVATE_KEY` 已保存到 GitHub Actions 加密 Secret。v0.1.6 已发布三平台安装包、更新签名和 `latest.json`，官网已部署并验证为同一版本。原来未带 updater 的旧客户端，需要先手动安装首个支持更新的版本。真实跨版本安装与重启验收仍需在后续版本及各平台进行。

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

## 发布修复验收（2026-09-09）

- GitHub Release v0.1.6 包含 13 个附件，覆盖 macOS、Windows、Linux 安装包、更新签名、更新清单和校验和。
- 恢复工作流 `34286397872` 成功：复用已发布产物，Vercel 生产部署、首页/下载页/三平台版本信息检查、仓库下载清单回写全部通过。
- 修复 setup-node 自动启用 pnpm 缓存但未安装 pnpm 的失败；发布作业禁用隐式缓存。
- 官网刚部署后可能短暂返回 404；验证现在有限重试，并检查页面内容、版本、安装包 URL、大小及 SHA-256，避免误报成功。
- `pnpm release` 会检查原始发布和成功恢复的状态，失败时提示恢复而不会自动递增版本；参数拼写错误和暂不支持的预发布版本在修改文件前报错。发布前加入发布脚本回归测试。
- `pnpm release --resume v0.1.6` 重复执行会识别正在执行或已完成的恢复，不重复部署；恢复前要求修复已提交并推送，因为 Actions 使用远端 main。

新版本：`pnpm release`（默认递增 patch），或 `pnpm release 0.1.7`。已有标签发布失败：先提交并推送脚本修复，再运行 `pnpm release --resume v0.1.6`。不要移动已经发布的标签。
