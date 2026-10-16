# iOS / iPadOS 开发、测试与发布流程

2026-10-14 起作为 iOS 工作规则。设计决策见 [设计提案](DESIGN.md)；跨客户端权限与版本规则遵守 [AGENTS.md](../../../AGENTS.md)、[回归清单](../../development/REGRESSION_CHECKLIST.md) 和 [发布流程](../../release/RELEASE_PROCESS.md)。流程与客户端脚本已建立，模拟器启动和真机开发签名安装已验证，音频、文件授权和实际 Wi-Fi 上传仍待原生验收。当前证据见 [状态](STATUS.md)。

## 本机初始化与用户操作

本次检查：Xcode 27.0 / 27A266a，已选择 `/Applications/Xcode.app/Contents/Developer`，iOS 与模拟器 SDK 27.0 可用。iOS 27 模拟器运行时已安装；iPhone 15 Plus / iOS 27.0.1 已连接、配对并启用 Developer Mode。最低 iOS 16 运行行为仍需对应系统验证。

本次已安装并通过目标列表核验 Rust `aarch64-apple-ios` 与 `aarch64-apple-ios-sim`；Homebrew 已完成 CocoaPods 1.17.0 与 XcodeGen 2.46.0 安装。工程生成、模拟器启动、开发签名导出与真机安装已验证。

1. 用户打开 Xcode → Settings → Components（部分版本显示 Platforms），下载 iOS Simulator runtime。至少准备一个 iPhone 和一个 iPad；在 Window → Devices and Simulators → Simulators 中创建需要的设备。最低系统版本验证需另备对应运行时或真机。
2. 环境需要 Rust `aarch64-apple-ios`、`aarch64-apple-ios-sim`、CocoaPods；工程生成依赖按当前 Tauri CLI 验证。Apple Silicon 不强制安装 Intel 模拟器目标。
3. 用户在 Xcode → Settings → Accounts 登录 Apple ID。真机连接 Mac、解锁并信任电脑，按设备提示启用 Developer Mode；签名选择用户的 Team。TestFlight/App Store 需要 Apple Developer Program 和 App Store Connect 权限。
4. 工程已由 Tauri 生成；以后通过 `pnpm ios:init` 同步 `src-tauri/gen/apple/`，不要 File → New → Project 建立另一套 SwiftUI 工程。生成前先加入 iOS 专属配置与受控源码跟踪规则；不提交 Pods、DerivedData、证书、profile、Team 私密配置或本机路径。
5. 代理完成 Rust/mobile plugin 边界、Swift 插件与构建入口后，再打开生成工程。用户在目标的 Signing & Capabilities 选择 Team 和 Automatic signing；仅添加实际需要的 Background Modes → Audio。用户的手工变更应回写可重建的模板/配置，避免下次初始化丢失。

当前使用 Tauri 2.12.3 / tao 0.37.1，并通过单窗口 UIScene manifest 适配 SDK 27。Xcode Rust 构建步骤统一调用 `scripts/ios/xcode-build.sh`，包含 Node/Rust PATH 与进程级 Git HTTP/1.1 配置。Team 在工程重生成前保存到忽略的 `.ios-local/Signing.xcconfig`，也可用 `APPLE_DEVELOPMENT_TEAM` 显式覆盖；不要提交这些本机文件。Vite 忽略原生工程、签名和产物目录，避免原生构建触发页面重载。

## 开发顺序与完成条件

| 阶段 | 工作 | 完成证据 |
| --- | --- | --- |
| 设计 | 确认手机/平板、导入、系统范围、身份/渠道 | 记录用户决定，更新设计状态 |
| 工程 | iOS 配置、生成工程、Rust 桌面隔离、Swift plugin 注册 | iPhone/iPad 模拟器可启动，桌面/Android 回归通过 |
| 垂直链路 | 合成媒体导入/授权、扫描数据库、原生播放/队列 | 源文件前后 SHA-256 不变；暂停/seek/切歌与重启一致 |
| 生命周期 | 后台音频、锁屏、来电/音频中断、耳机路由、计数/定时器 | 真机日志及测试；进程恢复不自动播放，计数不重复 |
| 功能与布局 | 共享全部集合、歌词/评分/歌单/统计，安全区与分屏 | 桌面、Android phone/Pad、iPhone/iPad 截图与交互回归 |
| 交付 | 本地安装包、升级、签名/导出验证 | 本次产物、版本、架构、校验和、签名与安装证据 |

## 每次开发固定门禁

1. 读取回归清单，记录影响范围和最近批准的设计；先复现缺陷，再在发生的层添加回归。
2. 运行跨客户端本地门禁：`pnpm check`、`pnpm test:e2e`、Rust fmt、Clippy `-D warnings`、Rust tests、10k FTS benchmark、release-script tests、`pnpm website:build`，完整命令见回归清单。
3. iOS 原生单元与集成测试覆盖导入授权、损坏文件、云端失败、重扫稳定 ID、数据库升级、队列恢复、后台计数与定时器。相关改动追加 Xcode XCTest/XCUITest；共享浏览器测试不能替代 WKWebView/原生测试。
4. iPhone 360/390/430、iPad 600/840/1024 CSS px、断点两侧、深浅主题、大字体、VoiceOver、横竖屏、窄分屏和安全区均需截图/交互检查。更多菜单二次点击关闭、焦点恢复、滚动取消长按，所有复用列表的播放标识/封面留白单独覆盖。
5. 真机检查后台/锁屏、控制中心、音频中断、蓝牙/耳机/AirPlay、进程恢复、离线文件、大队列持续操作和升级保留数据。无设备则明确待验收，不宣称 iOS 发布完成。
6. 生成本次安装包后再安装验证；记录日期、源提交/工作区摘要、版本/build、设备/系统、数据规模、命令、结果、截图/日志和剩余工作。测试材料只用可再分发或合成媒体。

## 版本与发行

- root `package.json` 是共享 versionName。准备首个可安装产品变更时选择未使用的稳定版本，按现有 set-version/check-version 同步；当前设计/文档阶段不分配版本。
- 首次安装构建前建立 `packaging/ios/build-number.json` 单调编号；一次预期构建分配一次，失败重试复用，已交付新构建递增。写入并核验 IPA/app 内 `CFBundleVersion`；不得使用 Android versionCode。
- root 已提供下方命令；自动真机测试入口尚未建立，真机验收按清单执行，不能用模拟器测试替代。
- 本地 release 默认仅构建/归档/验证，不上传、创建远程标签或修改桌面 updater/网站下载元数据。模拟器 `.app`、真机开发签名 `.app`、签名归档 `.xcarchive` 和导出 `.ipa` 分别报告，模拟器包不是可在真机安装的 IPA。
- 核验 Bundle ID、最低系统、版本/build、架构、app 图标、Info.plist、签名、entitlements、provisioning profile 与产物 SHA-256；保存脱敏 manifest。签名身份/私钥/profile 不入库。
- 建议先本地模拟器与真机，再 TestFlight，再 App Store。TestFlight 上传、外部测试/审核、App Store 提交/发布均由用户明确授权，Apple 审核通过与实际上架是独立状态。
- 需要用户操作时给出具体的 Xcode Organizer → Archives → Validate App / Distribute App 步骤及渠道选项；本地打包完成不能写成已上传或已发布。
- 桌面仍交给用户在 main 运行明确版本的 `pnpm release <version>`；iOS 本地验证不等待桌面发布。不要额外建议 git push 或跳过检查。

## 官方依据

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri App Store / build-number / Xcode integration](https://v2.tauri.app/distribute/app-store/)
- [Apple directory access](https://developer.apple.com/documentation/uikit/providing-access-to-directories)
- [Apple AVAudioSession](https://developer.apple.com/documentation/avfaudio/avaudiosession)

## 当前公共命令

| 命令 | 职责与前置条件 |
| --- | --- |
| `pnpm ios:doctor` | 只读诊断；无模拟器运行时返回非零，不自动下载/登录 |
| `pnpm ios:init` | 首次生成，或同步既有工程版本、测试 scheme、图标；无须手动新建工程 |
| `pnpm ios:dev` | Tauri iOS 开发入口；透传设备名和 `--open`，需要模拟器或配置好的真机 |
| `pnpm ios:build:simulator` | arm64 模拟器 debug 构建，无生产签名 |
| `pnpm ios:build:debug` | 已配置 Team 的 arm64 真机开发签名归档，不上传 |
| `pnpm ios:test:unit` | 原生计数、文件/回收站、一级目录及队列规则；不证明设备音频运行 |
| `pnpm ios:test:wifi` | macOS 复用生产接收器的真实局域网与 Chromium 回归；不替代 iOS 设备权限/前台验收 |
| `pnpm ios:test:simulator <UDID>` | 先构建，再对指定模拟器执行 XCTest/XCUITest；分别在 iPhone 和 iPad 执行 |
| `pnpm release:ios -- --simulator --debug` | 完整本地门禁后归档模拟器 ZIP、manifest、checksum；不上传 |
| `pnpm release:ios -- --device --debug` | 本地真机调试 IPA；需 Team/证书/profile，本机开发签名导出已验证 |
| `pnpm release:ios -- --simulator --debug --dry-run` | 展示计划，不运行构建/签名/上传 |

模拟器在 Xcode 手动运行时用 `pnpm ios:dev -- --open`；真机使用 `pnpm ios:dev -- --open --host <Mac局域网IP>`，Mac 与手机需同一局域网，避免 localhost 指向手机自身。这会启动 Tauri 与 Xcode 集成；不能只双击工程就假定 Rust 构建环境完整。选择生成的 `nanoplayer_iOS` scheme 和目标设备；Signing & Capabilities 选择用户 Team。后续提供 `APPLE_DEVELOPMENT_TEAM` 给 CLI，并验证生成工程的 Team；不要把 Xcode 私有账号设置提交。

TestFlight：通过本地门禁和真机验收后，在 Organizer 选择对应归档，Validate App，再 Distribute App 选择 App Store Connect 并上传，等待处理后在 App Store Connect 分配测试人员。App Store 提交审核和正式发布另行授权，不从本地脚本自动执行。
