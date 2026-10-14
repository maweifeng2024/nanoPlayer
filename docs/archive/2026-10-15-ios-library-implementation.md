# iOS 三类资源库实现与本地验证

日期：2026-10-15。产品版本 0.1.23，iOS build 5，Android versionCode 1023。用户已确认 [资源库设计](../clients/ios/LIBRARY_DESIGN.md) 并授权实现。源码是 main 本地工作区，保留任务开始前的未提交 iOS 接入等修改；没有提交、推送、创建标签、远程构建、TestFlight 上传或网站部署。

## 已实现

- iOS 独立资源库页面按 nanoPlayer / Files / 其他音乐 App 三分区展示，区分管理权限、来源授权、扫描状态、加入音乐库开关和文件多选。iPad 宽窗口显示来源与内容两列，窄窗口单列；文件列表分批显示。
- 自有管理区 `Documents/Music`：新建/重命名文件夹及文件、批量移动、删除空文件夹；目标选择器可新建文件夹。默认收件箱，冲突默认保留两份、扩展名前追加序号，或跳过；不覆盖、不提供非空删除或外部写入。
- 外部来源通过系统选择器授权；Files 与其他 App 分类由用户确认，App 名称不冒充系统自动识别。UUID 为持久身份，来源组合名称与稳定序号避免冲突，可编辑显示名。原有 bookmarks 迁移为 Files 来源；保留旧文件与旧管理区位置。
- 外部文件/子文件夹可选择范围索引或恢复索引全部；扫描未选文件保留数据库历史记录而不显示为可播放曲目。外部仅提供复制到 nanoPlayer，不提供移动/改名/删除。
- 导入与 Wi-Fi 接收均选择自有目标。Wi-Fi 运行时前端锁定目标，移动/重命名要求先停止接收；流式上传、配对码与前台规则保留。同名上传在串行接收队列中预留名称，不再给所有文件添加 UUID 前缀。
- 系统音频“用 nanoPlayer 打开”通过 Tauri Opened 事件进入受控暂存区，再显示保存目标；完整复制、字节校验后才入管理区与音乐索引。配置公开应用 Documents 供 Files 访问。

## 数据与权限边界

`NativeLibrary` 在 documents worker 串行处理文件操作；外部路径只读，写入目标只能解析到管理区内，拒绝绝对路径、上级逃逸和符号链接越界。复制使用文件协调、分块 SHA-256 和原子落位；错误逐项报告，原文件不变。来源 JSON 有 schema version，拒绝未来版本而不静默重置。

移动先写持久 intent，再操作文件，Rust 用事务更新路径，保留 root/media/track ID；提交后才确认日志。重新授权沿用来源 UUID、别名、相对索引范围和数据库根 ID。原生队列同步路径，暂停后移动当前歌曲时恢复位置与会话计数状态。数据库冲突会回滚并保留恢复日志，不覆盖旧记录；文件系统/数据库冲突状态与真实进程中断仍需设备验收。

内部恢复动作不能通过前端 `ios_native` 调用；iOS capability 去掉直接插件 dispatch 权限，所有前端操作经过 Rust 桥接。桌面和 Android 的资源库视图及原始目录只读合同保持原样。原生文件动作没有改写评分、歌词或音频标签。

## 本次验证

| 检查 | 结果与范围 |
| --- | --- |
| `pnpm check` | 通过：lint、UI tokens、60 Vitest、TypeScript/Vite build；最终打包入口重跑 |
| `pnpm test:e2e` | 87 通过，包含 desktop/Android phone/Pad/iPhone/iPad；`/tmp/nano-library-device-release.log`、`/tmp/nano-library-e2e.log` |
| `pnpm ios:test:unit` | 54 个原生规则检查通过，含原有 20 项；新增真实临时文件的只读/越界/同名/复制 SHA 与移动字节保持、日志恢复、部分索引、重新授权与配置版本拒绝 |
| `cargo fmt --check --manifest-path src-tauri/Cargo.toml` | 通过 |
| Desktop Rust Clippy `-D warnings` / tests | 通过；20 passed、2 ignored；新测试证明移动保留 ID/评分/歌单及冲突事务回滚 |
| 10k FTS ignored benchmark | 单独执行通过，最终打包门禁重跑 |
| iOS Rust/Swift Clippy | `IPHONEOS_DEPLOYMENT_TARGET=16.0 cargo clippy --manifest-path src-tauri/Cargo.toml --target aarch64-apple-ios-sim -- -D warnings` 通过 |
| `node --test scripts/release/*.test.mjs scripts/ios/*.test.mjs` | 23 通过 |
| `pnpm website:build` | 通过，未部署 |
| iPhone XCUITest | iPhone 18 Pro / iOS 27，通过启动/导航/Wi-Fi 弹窗、新建文件夹、移动到收件箱、删除空文件夹；`artifacts/ios/tests/C3A4AA33-6DEC-47F9-9A55-17374C1271FE-1792019441838.xcresult` |
| iPad XCUITest | iPad (A16) / iOS 27，最终启动/导航/Wi-Fi 弹窗、新建、移动到收件箱、删除空文件夹通过；`artifacts/ios/tests/510086B7-EEB8-4AD1-86F7-AF082F64916B-1792019542459.xcresult` |
| 相对文档路径与差异 | `git diff --check` 通过；全仓 Markdown 本地路径检查无缺失 |

首次 Swift CryptoKit/SwiftPM 编译被 sandbox 缓存权限阻止，允许本机编译后通过；测试初次编译发现测试断言的 throwing autoclosure 类型不匹配，已修正后通过。视觉检查发现搜索框被按钮挤压、裸按钮继承系统灰底，已修复并重跑用例。React 检查移除了弹窗/页面循环依赖，保留弹窗焦点与监听清理，补齐菜单外部点击、返回和视口定位。

截图：`artifacts/ios/v0.1.23-b5/evidence/`，包括浏览器 iPhone、iPad 390/600/840/1024 与浅色、iPhone 原生截图。浏览器使用明确标记的内存演示，不读取设备文件，不能作为真实 Files/网络证据。

## 最终产物

| 客户端 | 路径 | 元数据 / 签名 | SHA-256 |
| --- | --- | --- | --- |
| iOS | `artifacts/ios/v0.1.23-b5/device-debug/nanoPlayer-0.1.23-b5-arm64-device-debug.ipa` | 0.1.23 / 5；arm64；minimum OS 16；开发签名/profile、codesign strict、ZIP、版本/架构核验通过 | `9023c331b6a86cd4bb3d5cd87e28721e1479d4bba9208f7d79b9719be566712c` |
| Android | `artifacts/android/v0.1.23-b1023/debug/nanoPlayer-0.1.23-b1023-arm64-debug.apk` | 0.1.23 / 1023；arm64-v8a；minSdk 29；ZIP、badging、APK v2 Android Debug 签名核验通过 | `0a757a3012ea827be87139d297033635d4cdd9e031e5cdfce833941f9bebee09` |

产物目录各有 manifest、SHA256SUMS、signing-verification。最终 IPA 未安装到真机，APK 未安装到 Android 设备。本次没有改 Android 原生队列/文件能力，Android JVM/instrumentation 未重复执行。

## 仍待设备验收

1. Files/iCloud 及至少两个实际公开目录的音乐 App 授权、云端占位、权限撤销与续期、重新授权、系统分享/打开方式、真实断网和空间不足；不能推断可访问其他 App 的私有沙箱或受保护订阅缓存。
2. Wi-Fi 多文件/同名/Unicode/512MB 上下界、网络隔离/拒绝、切后台、中断清理与目标目录，前台之外不承诺接收。
3. 带真实合成音频的进程中断/升级恢复、暂停当前曲目移动后继续播放与统计、后台音频、最低 iOS 16、安全区/分屏、大字体和 VoiceOver。当前模拟器 UI 测试的文件夹为空；真实文件字节与 ID 由 native unit/Rust tests 分别验证。

仅剩用户运行的发布命令：在 main 执行 `pnpm release 0.1.23`，负责门禁、提交/推送、桌面安装包与网站发布；不上传这些本地 iOS/Android 包。没有标签需要 resume，不额外建议 git push 或 skip-checks。
