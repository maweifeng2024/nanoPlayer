# 首页推荐验收记录

日期：2026-11-09；源码基线为本地 `v0.1.31`，准备版本 `0.1.32`（版本一致性已校验，未创建/推送标签）。宿主 Windows、Node 26.13.0、pnpm 11.24.0、Edge 浏览器。合成/演示音乐元数据，不访问或修改外部音频。本轮未部署 Worker，按用户安排在另一台计算机部署。

## 实现边界

- iOS 首页对齐 Android；播放最多/高评分行高 64px，标题与卡片留白压缩，保留 44px 封面和触控命中。
- 首页左上角是推荐歌单卡片，显示封面、名称、一句话描述；不展开推荐曲目列表。点击播放建立最多 12 首的推荐队列，播放页保存名称、描述和曲目顺序，保存后不重复创建。
- 设置中的“开启推荐”默认打开，明确关闭后持久保留。未配置服务仍使用本地推荐，不发模型请求。
- 本地筛选、12 KB 上下文预算、跨启动候选轮换、1/3/7 天频率、active/pending 下次启动更新、失败退避。Worker 包含 AI binding、共享令牌、IP 限流和输入/输出校验。具体设计见 [推荐设计](../architecture/RECOMMENDATIONS.md)。

## 本地检查

| 命令/范围 | 结果与边界 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过；初始无依赖，首次 pnpm 缓存访问失败，获准访问缓存并安装后重跑 |
| `pnpm check` | 通过：lint、设计 token、17 个 Vitest 文件共 78 项、3 项 Worker 测试、TypeScript/Vite 构建 |
| `pnpm recommendations:deploy:check` | 通过 Wrangler 4.152.0 dry-run；AI、5 次/60 秒 IP 限流绑定可识别。不证明线上模型权限、路由或费用 |
| `pnpm test:e2e`（Edge） | 最终完整运行 106 项通过，7 项按环境跳过（其中模型集成已单独验证；其后额外新增手机/Pad 保存专项覆盖），完整结果在 `artifacts/recommendations/e2e.log`；macOS 字体快照 6 项在 Windows 按原规则跳过；模型集成默认无 endpoint 时另跳过，单独用测试配置运行 |
| 推荐生成集成 | 使用测试 endpoint/token 和 Playwright 本地路由拦截，5 项通过，覆盖桌面、iPhone、Pad 播放页保存；验证只发送轮换后的合格元数据、幻觉/重复 ID 过滤、标题描述缓存、生成结果不立即覆盖 active、重启采用、独立播放队列与保存、默认开启与关闭持久化。结果在 `artifacts/recommendations/inference.log`；不是线上 AI 验收 |
| 响应式与截图 | 桌面 720/1440、Android 手机 360/390、Pad 600/840/1024、iPhone 360/390/横屏及 iPad 600/840/1024，深/浅色。实际截图在 `artifacts/recommendations/screenshots/`，检查封面、描述、卡片间距、页面无横向溢出和播放器 |
| `cargo fmt --check --manifest-path src-tauri/Cargo.toml` | 通过 |
| `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | 通过；初始网络沙箱失败，获准下载锁定依赖后重跑完成 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 26 项通过、2 项默认忽略；含原有只读源音频验证，日志 `artifacts/recommendations/rust.log` |
| 10k FTS ignored benchmark 显式运行 | 1 项通过；不能据此声称 Android 原生大库响应通过 |
| `node --test scripts/release/*.test.mjs` | 14 项通过，5 项失败：现有恢复测试用 POSIX shebang `gh` 假程序，在 Windows 不能作为可执行程序启动（ENOENT）。不触发真实发布，不删除断言迁就平台；另一台兼容宿主需重跑 |
| `pnpm website:build` | 安装 website 锁定依赖后通过；未部署，未改公开下载清单 |
| `pnpm ios:test:unit`、`node scripts/ios/doctor.mjs` | 阻塞：Windows 无 macOS/Xcode/xcrun/iOS SDK/模拟器，不能建立 iOS 编译或设备验收结论 |
| `node scripts/android/doctor.mjs`、`pnpm release:android -- --debug` | 环境检查失败：无 JDK、Android SDK/NDK 和 Android Rust target；未产生本轮 APK，无 ABI/校验和/签名证据。versionCode 1032 仍是此前 authority，本轮尚未分配新实际构建编号 |
| `git diff --check`、版本及文档相对路径检查 | 通过；相对路径扫描结果见 artifacts/recommendations/document-links.json（既有缺失与新引入分开记录）；没有移动现有文档，没有改源音频或在线歌词默认选择 |

## 已修复与尚待验收

浏览器首次运行发现 Windows `spawn pnpm.cmd` 报 EINVAL；改为通过当前 Node 启动已安装 Playwright CLI，并支持测试文件参数。新设置开关使旧无名称 switch 定位产生歧义，已明确定位在线歌词；保留其默认关闭断言。旧首页随机卡片断言已按最终歌单卡片行为更新；模拟 macOS UA 的桌面用例显式设置 maxTouchPoints=0，避免触屏 Windows 宿主被识别成 iPad。

仍待：另一台机器部署 Worker、配置 APP_TOKEN/endpoint 和真实 Origin、真实 AI 质量与费用验收；Android 新 build number 分配、APK 编译和完整产物验证、安装后队列/后台/锁屏/大库响应；macOS 的 iOS Rust/Swift 编译及 iPhone/iPad 运行；macOS 字体快照需在对应宿主重新查看并更新。保存歌单的本地持久化测试不代替原生重启后的同步验收。

## 后续执行顺序

1. 按 [Worker 部署说明](../../services/recommendations/README.md) 配置并部署独立服务；客户端构建注入 endpoint/token、准确 CSP origin。桌面 CI 已读取同名 Actions secrets，未提供时只启用本地推荐。
2. 在具备原生工具链的机器完成上述剩余门禁；为计划中的 Android 构建把 `packaging/android/version-code.json` 从 1032 分配为未使用的下一个编号（先核对另一台机器的当前 authority，仅分配一次），再 `pnpm release:android -- --debug`。验证新 APK 的版本/编号、ABI、SHA-256、ZIP 和调试签名；不是生产签名发布。
3. 全部门禁满足后，由用户在 `main` 执行 `pnpm release 0.1.32`，提交/推送、构建并发布桌面及官网。本轮未执行推送、标签、远程工作流或桌面安装包构建；不要使用 `--skip-checks`，未创建标签时不使用 resume。

### AICodeMirror 接入

- 外部模型使用 Responses API，模型密钥只从 Worker Secret 读取。验证 HTTPS、禁止重定向、限定请求超时、解析输出文本及候选 ID 白名单。
- 缺少密钥和上游错误返回受控失败，客户端保留本地推荐。非法请求 JSON 或候选含 null 返回 400。
- 以 mock 验证协议、权限及故障。真实模型调用待配置 Secret 和部署后验收。

2026-11-09（Asia/Shanghai）结果：Worker 5 项通过，含 AICodeMirror 请求与白名单、缺密钥、非 HTTPS、上游错误、非法 JSON 和 null 输入。Wrangler dry-run 通过。推荐 Playwright 套件用拦截 endpoint 验证 5/5 通过，生成桌面、手机、Pad 截图。Cloudflare 账户登录过期，模型 Key、实际推理、生产域名和原生设备验收待完成。三端构建与全套回归状态见 [本轮任务记录](../DEVELOPMENT_LOG.md)。

2026-11-09 部署复测（Asia/Shanghai）：OAuth 刷新后已绑定生产子域名。Worker 单测 5/5、dry-run、权威 DNS 和 HTTPS 路由通过。无应用令牌返回 401，带应用令牌的合成数据在缺模型 Key 时返回 503。等待模型 Secret 后执行真实推理与客户端联通验证。

模型密钥录入后的线上排查验证上游 HTTP 状态及响应格式，诊断日志只记录状态和错误类别，使用合成曲目复测。

0.1.33 线上验收：最终 Worker 使用权威 DNS 返回的地址进行 HTTPS 验证，合成曲目推理返回 200，候选 ID 校验通过。三种 Tauri Origin 的 CORS 预检通过。5 项 Worker 单测和 5 项推荐浏览器专项通过。已在三端产物验证在线配置，默认 DNS 和客户端实机安装、启动及线上请求仍待验收。上一轮完整浏览器最终 108 通过、1 跳过、6 个截图基线比较失败。详见 [任务记录](../DEVELOPMENT_LOG.md)。
