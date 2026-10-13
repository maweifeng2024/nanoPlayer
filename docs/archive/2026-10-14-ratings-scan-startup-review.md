# 2026-10-14 评分、扫描与 Android 启动/切页回归

## 实现与证据边界

- 基于 `main` / `90c2258` 的本地修改，产品版本 0.1.19，Android versionCode 1017。只完成本地工作；桌面/官网未发布。
- 有评分列的歌曲行：已有评分的实心星原来仍使用灰色，现高亮为金色并暴露 `aria-pressed`；评分变化立即写入原生 user state。浏览器验证点击、取消、刷新恢复；原生升级持久化仍待设备验收。
- Android SAF 扫描：原来的 `DocumentFile` 属性访问为每首歌反复调用 provider，而且重扫每首歌都打开音频、提取封面。现每个目录一次带字段投影的批量查询；将数据库指纹传给扫描 worker，未变音频跳过元数据/封面/歌词读取。指纹包括音频大小、修改时间、旁挂歌词 ID/大小/修改时间。未知修改时间强制重读，读取失败不缓存成功指纹；取消检查覆盖文件循环。源媒体只读，封面仅写应用缓存。
- 桌面扫描原本已有增量元数据读取，本次保留。Android 首次升级扫描需要建立新指纹，之后未变文件才能复用；不声称首次扫描无需读取，也不声称真机提速比例。
- 启动：等待 native library snapshot 后再渲染内容及决定首次引导。已配置资料库不再短暂显示空库引导；真正空库仍显示首次引导。浏览器用延迟快照验证两条分支及评分原生保存。
- 切页：Zustand 原来对每个状态 set 都 JSON 序列化大队列/歌单并同步写 localStorage；现在比较持久化字段引用和值，未变时跳过序列化和写入。Android 播放轮询保留未变 lastPlayedAt 引用，避免统计与背景反复重算。10k 队列下 15 次首页/资料库/歌单切换，localStorage 新写入 0 次；这个结论只代表浏览器路径。

## 本次验证

| 命令 / 场景 | 结果 |
| --- | --- |
| `pnpm check` | lint、UI token audit、Vitest 58/58、前端构建通过；APK 门禁在同步版本后再次通过 |
| `pnpm test:e2e` | 80/80；桌面、手机 360/390、Pad 600/840/1024 及已有响应式/菜单/大库回归 |
| `cargo fmt --check --manifest-path src-tauri/Cargo.toml` | 通过 |
| `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | 通过；0.1.19 再次执行 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 18 通过、2 个显式门禁忽略；包括音频字节不变和 SAF 重扫身份/评分/歌词/歌单保留 |
| `cargo test --manifest-path src-tauri/Cargo.toml database::tests::search_benchmark_10000_tracks -- --ignored --exact` | 通过 |
| `node --test scripts/release/*.test.mjs` | 19/19 |
| `pnpm website:build` | 通过；0.1.19 再次执行 |
| `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home src-tauri/gen/android/gradlew -p src-tauri/gen/android :tauri-plugin-nanoplayer-mobile:testDebugUnitTest` | 15/15，包括 2 个新增音频/歌词指纹用例 |
| `node scripts/release/check-version.mjs` | 0.1.19 一致 |
| `pnpm release:android -- --debug` | 本地 APK 构建及验证通过，1017 只分配一次，失败重试复用 |
| APK badging、`unzip -t`、SHA-256、apksigner | versionName / versionCode / ABI 一致、ZIP 完整、校验匹配、v2 Debug 签名通过 |
| `git diff --check` | 通过 |

环境处理：首次 E2E Chromium 因沙箱 MachPort 权限失败；放开权限后重跑。另一次同时构建官网触发 Vite 页面刷新，72 通过/5 失败；官网构建结束后完整重跑 80/80。未修改快照掩盖失败。pnpm 11 在仅版本同步后自动尝试重新安装并因无 TTY 停止；本地构建设置 `pnpm_config_verify_deps_before_run=false`，保留依赖且仍执行全部 APK 门禁。Gradle 缓存锁被沙箱拒绝后在批准的沙箱外重试。Git CLI 网络查询失败，改用 GitHub connector 的只读 matching refs 确认 0.1.19 未使用。

## 截图与日志

本地证据目录：`artifacts/verification/v0.1.19/`。评分截图人工确认金色实心星与灰色空星可区分；手机/Pad 首页截图确认导航、播放器及窄 Pad 图标侧栏。

- [桌面评分](../../artifacts/verification/v0.1.19/rating-visible.png)
- [手机 390px 连续切页](../../artifacts/verification/v0.1.19/navigation-390.png)
- [Pad 600px](../../artifacts/verification/v0.1.19/review-home-600.png)
- [Pad 1024px](../../artifacts/verification/v0.1.19/review-home-1024.png)

## 本地安装包

- [APK](../../artifacts/android/v0.1.19-b1017/debug/nanoPlayer-0.1.19-b1017-arm64-debug.apk)：0.1.19 / 1017，`app.nanoplayer.android`，arm64-v8a，209,304,106 字节，minSdk 29 / targetSdk 36。
- SHA-256：`caac7f70066e10393238be3cb59f16a7ca2c08d46c50a3fd71facf442a0734fe`。
- Android Debug RSA 2048，APK v2 签名；非生产签名，未公开分发。
- [manifest](../../artifacts/android/v0.1.19-b1017/debug/manifest.json)、[签名结果](../../artifacts/android/v0.1.19-b1017/debug/signing-verification.txt)。

## 未验收与交接

`adb devices` 无设备。本次未运行 instrumentation、未安装/启动 APK，也未测量实际 SAF provider 查询耗时或 ANR；不能据浏览器/单元测试认定所有原生卡顿已消失。需连接真机后保留数据升级安装，复核冷启动、同规模首次/重复扫描、歌词修改/删除、授权失效/恢复、播放中连续首页/资料库/歌单切换及 logcat/新增 ANR。实际资料库、设备厂商、后台行为和 provider 性能仍是接受边界。

在根目录 `main` 运行 `pnpm release 0.1.19` 完成用户授权的桌面发布流程：检查、提交、标签/推送、远程安装包与官网发布。代理未执行。标签前失败仍修复后运行同一版本，不使用 resume。
