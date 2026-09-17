# 已有成果与文档一致性核对

核对日期：2026-09-11
代码基准：main `ef8aa17`，应用版本 0.1.7。开始核对时工作区干净。
范围：代码/配置/迁移、README、docs、模块说明、平台打包说明、发布脚本与下载元数据；只改文档，不改程序、版本、安装包或线上部署。

## 当前成果判断

nanoPlayer 已具备桌面资料库与播放器主要功能，并已发布 macOS universal、Windows x64、Linux x64 安装包。不能再将 Windows/Linux 整体记为“计划中”。但原生媒体键、设备/长时稳定性、代码签名/公证和跨版本升级验收仍须与“已发布”分开。

iOS、Android 与 Pad 尚无已验收实现。新增的 [移动可行性分析](../architecture/MOBILE_FEASIBILITY.md) 仅包含技术比较和工作量估计，不是实施计划。

## 发现与修正

| 原文不一致点 | 核对依据 | 文档修正 |
| --- | --- | --- |
| README 称 Linux 下载未开放，分发矩阵称 Windows 尚在计划 | GitHub v0.1.7 API、下载清单、发布 workflow | 三平台均已发布，逐项保留资格验收边界 |
| Git 规范称没有提交历史 | 当前 Git log 与多个版本标签 | AGENTS 改为已有历史和桌面发布 |
| 图标生成说明仍引用 v1 | 图标目录说明和设计基线指向 v3 | SETUP 和实现状态统一为 v3，移除旧图标大小冒充当前验收 |
| 状态页停留 14 单元测试、9/13 E2E，日期陈旧 | 当前执行结果 | 30 单元测试、27 E2E；旧数据移入历史口径 |
| 首页被描述为整个启动周期不再更换 | HomePage 挂载时生成随机种子 | 返回首页重新选择，跟随歌曲封面并有 SVG 回退 |
| 四播放模式、旧计次阈值 | store、PlayerBar、测试和产品基线 | 顺序/随机与三种循环独立，计次按自然完成 |
| Media Session 容易被解读为原生系统集成 | PlayerBar 使用 navigator.mediaSession | 明确 WebView API；不声称原生 SMTC/MPRIS 已完成 |
| 架构遗漏用户功能迁移与 updater | 五个 SQL 迁移、updates 目录 | 补充 0005、更新模块和前端定时器依赖 |
| “只开启歌词才联网”与自动更新矛盾 | updater 检查与 App 启动逻辑 | 明确 GitHub 自动检查是独立联网行为 |
| 发布文档要求新版本才能用修复，又称先回写清单后部署 | release/resume/publish 脚本 | 按当前 main 恢复发布，先部署验证再回写；不移动原标签 |
| 自动更新记录仍将 v0.1.7 推送失败视为当前阻塞 | GitHub Release 和清单提交 | 标为已解决的历史事件，真实升级验收保持未验证 |
| 原始方案中的立即执行顺序、Windows/Linux 1.2 范围与当前不符 | 当前实现及发布 | 保留历史方案但撤去当前待执行含义；不生成移动排期 |
| 迭代计划概括“全部完成”，正文长时/格式门禁仍未完成 | 同文验收边界 | 限定已完成为功能与部分原生壳层；M6 不作整体完成承诺 |
| shared/playlists 目录文案像已有实现目录 | 当前源码布局 | 明确真实文件位置，M3U8 尚未实现 |
| Changelog 多个空版本及累积列表误导归属 | Git log/tag 与当前内容 | 按标签差异补齐 0.1.2–0.1.7，区分标签内客户端变化与标签后的发布工具修复 |

## 版本与发布证据

- 根 package、Tauri 配置、Cargo package、官网 package/lock 的版本检查通过：0.1.7。应用 Cargo.lock 与下载清单也为 0.1.7。
- [GitHub v0.1.7](https://github.com/maweifeng2024/nanoPlayer/releases/tag/v0.1.7) API 实时返回 13 个附件：8 个安装/应用包、3 个更新签名、更新清单和 SHA256SUMS。
- 8 个包的名称、大小、SHA-256 与仓库下载清单逐项一致（与 GitHub API digest 比较）。没有重新下载全部二进制，也没有本轮安装测试。
- GitHub `published_at` 为 2026-09-08 23:26:22 UTC，即北京时间 2026-09-09 07:26:22。仓库清单/变更日志的 `2026-09-08` 保留其 UTC/发布版本日期含义，不能当作北京时间。
- 下载清单标记 `signed: false`：操作系统代码签名未就绪；更新包 `.sig` 的存在不改变此状态。
- 官网 `/downloads/latest.json` 在本环境两次连接超时（含沙箱外限时重试）。因此本轮未验证线上首页、下载页或清单版本；连接失败也不能推断官网已经下线。历史部署记录不作为本轮在线通过证明。

## 本轮验证

| 验证 | 结果与范围 |
| --- | --- |
| `node scripts/release/check-version.mjs` | 通过，0.1.7 |
| `pnpm check` | lint、30 Vitest、TypeScript、Vite 生产构建通过 |
| `node --test scripts/release/*.test.mjs` | 11/11 通过；本地监听测试最初被沙箱拒绝，获准重跑后通过，未触发发布 |
| `pnpm test:e2e` | 27/27 通过；独立临时端口，浏览器 demo/mock，不替代原生音频或真实升级 |
| `npm run build --prefix website` | 通过，静态首页和下载页生成 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 未完成：沙箱内 crates.io DNS 失败；获准联网重试后依赖持续下载，本轮在下载阶段中止（exit 130），未进入编译/测试，不判定代码测试失败或通过 |
| 文档检查 | `git diff --check`、20 份变更 Markdown 的本地链接与 UTF-8 检查通过；18 份现有说明更新、2 份新增文档；源码/配置/版本文件无变化 |

没有新做原生包构建、物理设备音频、手机模拟器或真机测试。历史 Rust 15 项通过/2 项忽略、FTS 性能和 macOS 实测继续作为有日期的旧证据，不混同当前结果。
