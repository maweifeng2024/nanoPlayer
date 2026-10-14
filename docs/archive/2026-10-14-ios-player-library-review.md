# iOS 播放页修复与资源库设计评审

日期：2026-10-14。源码为 `main` 的本地工作区，包含本任务开始前已有的 iOS 接入等未提交修改；没有新提交、标签、推送、远程发布或官网部署。

## 本次实现

- 桌面窄窗口播放器规则仅排除 Android，导致 iOS 进度和上一首/下一首等控件被隐藏，`player-tools` 的歌词按钮也被错误显示；现同时排除 iOS。
- 移动端正在播放正文移除重复“打开歌词抽屉”入口，保留播放器中一个可见歌词按钮；桌面正文入口保留。
- iPhone 横屏固定手机内容网格列，防止内容落入隐式列；窄 iPad 改为单列播放内容，低于 600px 的 iPad 播放器分两行，防止文字/控制裁切。
- 新增 `tests/e2e/ios-player.spec.ts`，覆盖 iPhone 360/390/844、iPad 390/600/840/1024、控件可见与窗口边界、单一歌词入口、二次点击关闭、收起和深浅色截图。

## 设计范围

[资源库推荐方案](../clients/ios/LIBRARY_DESIGN.md) 是待确认方案：三类来源、只读外部索引、自有目标文件夹、Wi-Fi 会话目标、自有移动/外部复制、来源命名与冲突规则。新增文件管理未实现；当前原生能力仍以 [iOS 状态](../clients/ios/STATUS.md) 为准。

## 验证

| 命令 / 检查 | 结果与证据 |
| --- | --- |
| `pnpm check` | 通过；lint/token、60 Vitest、frontend build；最终 Android/iOS 打包入口再次运行 |
| `pnpm test:e2e` | 最终 iOS 打包门禁 84 通过；覆盖 desktop/Android phone/Pad/iOS；`/tmp/nano-ios22-device-final.log` |
| `pnpm exec playwright test tests/e2e/ios-player.spec.ts --workers=2` | 最终追加浅色截图后 2 通过；`/tmp/nano-ios-player-before.log`（同名文件已用于最终复核，非初次失败记录） |
| `cargo fmt --check --manifest-path src-tauri/Cargo.toml` | 通过 |
| `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | 通过；最终打包门禁再次运行 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 19 通过、2 ignored；只读源文件测试包含在内 |
| `cargo test --manifest-path src-tauri/Cargo.toml database::tests::search_benchmark_10000_tracks -- --ignored --exact` | 通过；最终打包门禁再次运行 |
| `node --test scripts/release/*.test.mjs scripts/ios/*.test.mjs` | 23 通过 |
| `pnpm website:build` | 通过，未部署 |
| `pnpm ios:test:unit` | 20 原生状态/上传规则检查通过 |
| `IPHONEOS_DEPLOYMENT_TARGET=16.0 cargo clippy --manifest-path src-tauri/Cargo.toml --target aarch64-apple-ios-sim -- -D warnings` | 通过；首次 Swift sandbox 被阻止，允许构建后重跑通过；`/tmp/nano-ios-fix-ios-clippy.log` |
| `git diff --check` 与全仓 Markdown 本地路径检查 | 通过；52 Markdown 文件、0 缺失路径 |
| `pnpm ios:test:simulator C3A4AA33-6DEC-47F9-9A55-17374C1271FE` | 通过，iPhone 18 Pro / iOS 27；`/tmp/nano-ios22-phone-test.log`；`artifacts/ios/tests/C3A4AA33-6DEC-47F9-9A55-17374C1271FE-1791982927845.xcresult` |
| `pnpm ios:test:simulator 510086B7-EEB8-4AD1-86F7-AF082F64916B` | 通过，iPad (A16) / iOS 27；`/tmp/nano-ios22-pad-test.log`；`artifacts/ios/tests/510086B7-EEB8-4AD1-86F7-AF082F64916B-1791983874839.xcresult`；两端仅启动/导航/接收弹窗，未覆盖歌曲播放 |

初次 Playwright 被 macOS sandbox MachPortRendezvous 权限阻止；重跑后 iPhone/iPad 均在播放进度可见断言失败，证实用户反馈。样式修复后截图又发现窄 Pad 内容裁切，补修覆盖顺序并增加标题/按钮边界断言。前一轮 Android 1021 / iOS 3 包因此被最终包取代，不用于当前验收；为新预期构建分别递增至 1022 / 4，未覆盖已有包。

最终浏览器截图目录：`artifacts/ios/v0.1.22-b4/evidence/`。人工检查了 iPhone 竖/横屏、窄 iPad 及浅色图；浏览器 viewport 不等同系统安全区、系统大字体、VoiceOver 或真机分屏验收。

## 最终本地产物

| 客户端 | 产物 | 元数据与签名 | SHA-256 |
| --- | --- | --- | --- |
| iOS | `artifacts/ios/v0.1.22-b4/device-debug/nanoPlayer-0.1.22-b4-arm64-device-debug.ipa` | 0.1.22 / 4；arm64；minimum OS 16；开发签名、profile、codesign strict、ZIP 及版本核验通过 | `6ff797ed29e707c6fb7357129edbe054a4e4009ecaacb25bb7559cedfecd401c` |
| Android | `artifacts/android/v0.1.22-b1022/debug/nanoPlayer-0.1.22-b1022-arm64-debug.apk` | 0.1.22 / 1022；arm64-v8a；minSdk 29；ZIP/badging/SHA-256 与 APK v2 Android Debug 签名通过 | `7cdd59ced2c0ecbb538ba67b043bde2c222430f8d6bc5cfd9c4d7620e0108d5d` |

每个产物目录含 `manifest.json`、`SHA256SUMS` 和 `signing-verification.txt`。本次没有安装最终 IPA 到真机，也没有安装 APK 到 Android 设备；没有新增原生文件/队列逻辑，Android JVM/instrumentation 未重复执行。iOS 模拟器安装/启动测试不等于最终开发签名 IPA 的真机验收。

## 剩余边界与交接

1. 用户确认资源库布局、命名和保存/移动流程后再实现；确认不影响本次播放页修复交付。
2. 真机实际歌曲播放页、系统旋转/分屏/安全区、大字体/VoiceOver，以及此前未完成的后台音频/Files/Wi-Fi 验收仍待完成。
3. 用户若发布本次修复，在 `main` 执行 `pnpm release 0.1.22`。脚本负责门禁、提交/推送、桌面构建和网站发布；它不上传本地 iOS/Android 包。不要额外执行 `git push` 或 `--skip-checks`，也没有已有标签需要 resume。
