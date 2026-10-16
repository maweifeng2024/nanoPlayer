# 2026-10-16 iOS 资源库实现与验证

本次共享版本 0.1.24，Android versionCode 1024，iOS build 7；本地实现和产物不代表桌面/网站发布。用户先确认交互原型，再要求实现；随后将功能名统一为“Wi-Fi 传输”。本地 SDK 更新期间先完成其他验证，用户确认更新完成后恢复 iOS 编译与模拟器测试。

## 最终行为

- 首页两区：自有一级目录、外部只读来源；后代继承一级目录参与状态。子项多选和替换部分索引入口已移除，正式界面没有审核专用歌曲按钮。
- 只读引用采用系统选取/确认两阶段；取消不创建来源，复制和保存有独立目标确认。来源显示位置和只读方式；旧部分范围不自动扩大。
- 持久目录身份、一次性选择迁移和 Swift 原生队列规则保留选择、歌曲 ID 及用户数据；回收站路径墓碑与恢复日志复用 Rust 路径事务。
- 浏览器配对会话、注销、目录 ID/revision、忙碌保护、目录新建/改名/移动、回收站/恢复/彻底删除、任意深度上传、同名保留两份、进度与失败重试。文件名作为文本展示，不解释为 HTML。
- 修正首次配对后未取得目录 ID 就可操作的时序问题，以及停止传输时前一轮扫描忙碌导致最终文件漏同步的问题。
- 未实现 Apple Music/网易云私有库直接读取；公开 Files 目录可引用，官方服务适配另行开发。

## 检查证据

所有 pnpm 检查均在现有依赖下运行。因修改脚本/版本触发 pnpm 11 的自动依赖重装检查且无 TTY，使用 `pnpm_config_verify_deps_before_run=false` 保留已安装依赖；没有跳过 lint、类型检查、测试或发布门禁。

| 命令 | 结果与证据层级 |
| --- | --- |
| `pnpm check` | lint、设计 token、Vitest、前端构建通过；64 项 Vitest 通过；含停止传输时扫描串行化回归 |
| `pnpm test:e2e` | 89 项通过；桌面、Android 手机/Pad、iPhone/iPad 布局与资源库交互 |
| `pnpm ios:test:unit` | 75 项原生计数/上传、只读/复制字节保持、目录身份、选择迁移、回收站与队列规则断言通过；不等同 AVPlayer 真机验收 |
| `pnpm ios:test:wifi` | 复用生产 Swift 接收器，真实 HTTP 与 Chromium 配对/目录管理/上传/恢复/注销通过；上传前后 SHA-256 相等；文件名转义、窄屏与无 JS 错误通过 |
| `cargo fmt --check --manifest-path src-tauri/Cargo.toml` | 通过 |
| `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | 桌面目标通过 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 21 通过，2 ignored；10k 基准单独执行通过 |
| `cargo test --manifest-path src-tauri/Cargo.toml database::tests::search_benchmark_10000_tracks -- --ignored --exact` | 通过 |
| `node --test scripts/release/*.test.mjs scripts/ios/*.test.mjs` | 23 项通过 |
| `pnpm website:build` | 本地静态构建通过，无部署 |
| Android 插件 `testDebugUnitTest` | 15 项 JVM 测试通过；无连接设备/模拟器，未执行 instrumentation/安装 |
| `pnpm ios:doctor` | SDK 27.1 与 27.0/27.1 运行时可用；此前沙箱诊断失败和更新中构建失败不计为通过 |
| iOS 16 目标 `cargo clippy --target aarch64-apple-ios-sim -- -D warnings` | SDK 更新后最终原生插件与 Rust 编译通过 |
| `pnpm ios:test:simulator 510086B7-EEB8-4AD1-86F7-AF082F64916B` | iPad (A16) / iOS 27.0：2 项通过，包含实际 HTTP 目标目录上传和清理 |
| `pnpm ios:test:simulator C3A4AA33-6DEC-47F9-9A55-17374C1271FE` | iPhone 18 Pro / iOS 27.0：2 项通过；目录操作与实际 HTTP 配对、新建目标、上传合成 WAV、读取目录确认及测试目录清理 |

浏览器截图在 `artifacts/verification/v0.1.24/`；原生结果在 `artifacts/ios/tests/`。测试只使用合成数据与测试目录，不读取个人音乐。仓库开始时已有 `src-tauri/src/database/mod.rs` 修改，本次仅新增独立的回收站数据库测试模块引用，未改变其中行为；Rust 共享检查覆盖当前工作区。旧 0.1.23 安装包不作本次证据。

## 本地产物

Android：`artifacts/android/v0.1.24-b1024/debug/nanoPlayer-0.1.24-b1024-arm64-debug.apk`。实际 Android manifest 为 app.nanoplayer.android / 0.1.24 / 1024 / minSdk 29；ZIP 内仅 arm64-v8a 库，ZIP 完整性和 APK v2 调试签名通过。最终 SHA-256、字节数和生成时间见同目录 `manifest.json`、`SHA256SUMS` 与 `signing-verification.txt`；未安装设备。

iOS 最终包：`artifacts/ios/v0.1.24-b7/device-debug/nanoPlayer-0.1.24-b7-arm64-device-debug.ipa`。app.nanoplayer.ios / 0.1.24 / build 7 / arm64 / minimum iOS 16.0，开发签名、provisioning profile、严格 codesign 与 ZIP 完整性验证通过；未安装真机。build 6 是文案复核前预备包，保留但不作为最终交付。

- iOS SHA-256：`b71d822bf30b1f17b2a1119da7e4b26653023ba7063aa6cc35503ec381460965`，125643965 bytes。
- Android SHA-256：`136497ff568a72acd66c03ebe26c84d8b21009fe74b112fa4c5bb0bfee505e24`，399940637 bytes；调试 APK v2 签名通过。
- APK 安装命令（可选，需连接 Android 设备）：`adb install -r artifacts/android/v0.1.24-b1024/debug/nanoPlayer-0.1.24-b1024-arm64-debug.apk`。本次没有执行该命令。

最终 iPhone build 7 结果：`artifacts/ios/tests/C3A4AA33-6DEC-47F9-9A55-17374C1271FE-1792117330167.xcresult`，2 项通过；iPad build 7 结果：`artifacts/ios/tests/510086B7-EEB8-4AD1-86F7-AF082F64916B-1792117556367.xcresult`，2 项通过。两者运行 iOS 27.0，使用 SDK 27.1 编译；不声称 iOS 16 运行验收。截图已从测试附件导出并人工复核。

完整本地汇总为 `artifacts/verification/v0.1.24/verification.json`；修改输入的 SHA-256 及工作区基础提交为同目录 `source-inputs.json`。工作区修改尚未提交。生产分发签名、TestFlight、真机验证和桌面/网站发布不由上述本地证据推断。

## 剩余验收与交接

Files/iCloud/公开音乐 App 的真实授权、撤权/云端占位、系统分享打开、真机 Wi-Fi 网络环境与空间不足、带歌曲升级/中断恢复、后台音频和最低 iOS 16 仍需真机验收。目录管理只写自有 Music 与私有回收站，外部目录只读；不支持后台 Wi-Fi 常驻。当前浏览器目录编辑要求先暂停正在播放的自有歌曲；上传和浏览不受该限制。

桌面发布由用户从 main 执行 `pnpm release 0.1.24`；本次未推送、打标签、触发远程工作流或部署网站。发布脚本包含检查和推送，不另加 `git push`，不使用 `--skip-checks`。未有标签时失败仍重跑同版本命令，不建议 resume。
