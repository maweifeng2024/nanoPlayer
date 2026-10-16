# iOS / iPadOS 状态

2026-10-16。当前本地源版本 0.1.26，iOS build 10。空或纯空白歌曲标题现在回退到完整文件名，已有资料库不重扫即可生效；缺失的艺术家和专辑使用明确占位。已在连接的 iPhone 15 Plus 覆盖安装并人工核对文件名显示；验证和交付边界见文末 0.1.26 节。未上传 TestFlight 或公开发布。0.1.21–0.1.25 为对应构建的历史证据。

## 0.1.21 初始接入的源码（历史）

- Tauri 生成工程、iOS 16 配置、独立 Bundle ID 与 capabilities；Rust iOS 入口隔离桌面音频、updater、文件监听与菜单初始化。
- Swift mobile plugin 注册，应用数据库及共享 React 功能接入。复用 Android 手机/Pad 布局，iPhone 横屏保留手机导航，iPad 的桌面 UA 与窄分屏仍识别为 Pad。
- 文件/文件夹复制到应用 Music 目录；单独的只读文件夹引用与 bookmark 恢复。文件协调读取，不写入源音乐；丢失授权返回可恢复错误。
- AVPlayer 队列、暂停/seek、顺序/随机、循环、音量、锁屏/控制中心与音频路由面板；原生睡眠定时器、会话 journal、自然结束计数与 Rust 幂等确认。进程恢复默认暂停。
- 升级时恢复应用目录/授权目录路径，保持数据库根 ID；需真机升级验证。左边缘返回手势复用已有移动端关闭层级。
- 前台 Wi-Fi 接收、地址二维码、配对码、浏览器批量流式上传、停止后扫描；本地 HTTP 明示不加密。上传类型与大小限制、失败配对限流、随机目标文件名与不完整文件清理。
- 命令及本地打包契约见 [流程](WORKFLOW.md)，图标从既有 nanoPlayer 源图生成；不提交缓存或签名材料。

## 0.1.21 已验证（历史）

- 修复 Xcode 的 `UIScene life cycle is required` 启动终止：Tauri 2.12.3、tao 0.37.1，明确单窗口 UIApplicationSceneManifest。
- Rust 构建统一使用受控脚本提供 Node/Rust PATH 与进程级 Git HTTP/1.1；本机 Team 自动保存在忽略目录，重生成工程后恢复。没有改动全局 Cargo 缓存或提交签名身份。
- Vite 忽略原生构建、签名和产物目录。先前构建期间浏览器操作被重载打断；修复后完整回归通过。

| 门禁 | 本次结果 | 范围 |
| --- | --- | --- |
| `pnpm ios:doctor` | 通过 | Xcode/SDK 27、iOS 27 runtime、Rust targets、CocoaPods、XcodeGen |
| `pnpm check` | 通过 | lint、UI token、60 Vitest、frontend build |
| `pnpm test:e2e` | 通过 | 82 项，包含 desktop/Android phone/Pad/iPhone/iPad |
| `pnpm ios:test:unit` | 通过 | 20 原生计数与上传规则检查 |
| iOS Rust/Swift 编译与 Clippy | 通过 | arm64 simulator，warnings denied |
| Desktop Rust fmt/Clippy/tests | 通过 | 19 默认测试、2 ignored；10k FTS 基准另行通过 |
| release/iOS script tests | 通过 | 23 项，包含工程同步幂等性与本机 Team 恢复 |
| `pnpm website:build` | 通过 | 本地构建，未部署 |
| iPhone XCUITest | 通过 | iPhone 18 Pro / iOS 27；启动、菜单、资料库、Wi-Fi 弹窗开关 |
| iPad XCUITest | 通过 | iPad (A16) / iOS 27；启动、侧栏、资料库、Wi-Fi 弹窗开关 |
| 开发签名 IPA | 通过 | 0.1.21 / 2、arm64、minimum OS 16；ZIP、签名、profile 存在与版本校验 |
| 最终 IPA 真机安装/启动 | 通过 | 导出 IPA 解包后安装，iPhone 15 Plus / iOS 27.0.1，进程持续运行；不是全部功能验收 |
| Android 本地 APK | 通过 | 0.1.21 / 1020、arm64-v8a、minSdk 29，ZIP/badging/SHA-256/v2 debug 签名 |
| Android 真机/instrumentation | 未执行 | 本次没有安装新 APK 到 Android 设备；浏览器回归不是原生性能证据 |

原生测试首次发现 XCTest 控制台与 Tauri stderr 转发相互回灌，已通过测试启动环境 `OS_ACTIVITY_DT_MODE=NO` 解决；导航改用可见菜单，避免定位到收起的侧栏。两端成功 xcresult 与截图保存在 `artifacts/ios/tests/` 和 `artifacts/ios/v0.1.21-b2/evidence/`。命令日志在 `/tmp/nanoplayer-ios21-*.log`，这些均为本地输出。

本次 IPA：`artifacts/ios/v0.1.21-b2/device-debug/nanoPlayer-0.1.21-b2-arm64-device-debug.ipa`。

SHA-256：`f1783fe3e0dbb4809b3d11d177d89a079252f1b59f72e40784a0a699049e1ff0`。

Android APK：`artifacts/android/v0.1.21-b1020/debug/nanoPlayer-0.1.21-b1020-arm64-debug.apk`。

SHA-256：`6c06973b8d8026d2ac944afb4af7e87d81a47fc95bfae213d1cabf6b9fa3c7f6`。

## 必须完成的原生验收

首轮接入尚不代表 Android 原生功能完全对等：锁屏当前仅发送标题、艺术家、进度与时长，专辑/封面元数据尚未接入；自动真机测试入口尚未建立。Wi-Fi 接收当前要求可用的 IPv4 Wi-Fi 地址，IPv6-only 网络不在本轮已实现范围。iOS 格式解码范围须按 AVPlayer 实测，不继承 Android 的格式支持承诺。

1. 模拟器启动/导航已通过；仍需对应最低系统验证，以及返回手势、大字体、横屏与分屏完整验收。
2. 真机开发签名安装/启动已通过；继续验证 Files/iCloud/provider 的复制、引用、bookmark 失效/恢复、重启/升级和源文件 SHA-256 不变。
3. 用合成格式矩阵验证 AVPlayer 解码，锁屏/后台、音频中断、耳机路由、自然计数、睡眠定时器、进程恢复和大队列；尚未证明与 Android 的原生行为完全一致。
4. Wi-Fi 实际上传：正确/错误配对、多个文件、Unicode 名称、512MB 上下界、断网、切后台、空间不足、并发、无 Wi-Fi/访客网络隔离及权限拒绝。当前浏览器回归不证明原生接收成功。
5. 核验归档/IPA 版本、架构、签名、profile、entitlements、图标、校验和与安装，再准备 TestFlight。用户明确授权前不上传、不提交审核、不公开发布。

以上为 0.1.21 历史验证；当前本地交接版本见下节。桌面发布不上传 iOS，本地源码、编译通过、设备验收与公开发布分别报告。

## 0.1.22 播放页修复与资源库评审（2026-10-14）

已修复 iOS 被桌面窄窗口 CSS 隐藏的进度/播放控制、移动端重复歌词入口、iPhone 横屏内容网格，以及窄 iPad 内容/播放器裁切。资源库三类来源与管理区文件夹/移动需求见 [待确认方案](LIBRARY_DESIGN.md)，这些新能力未实现。

本次 60 Vitest、84 E2E、19 Rust tests、10k FTS 基准、23 release/iOS script tests、20 iOS native unit checks、desktop/iOS Rust fmt/Clippy、website build 和版本核验通过。额外 iOS 播放页 2 E2E 在最终浅色截图加入后通过，覆盖 iPhone/iPad 的控制可见、窗口边界、单一歌词入口和二次点击关闭。浏览器截图已人工复核，保存于 `artifacts/ios/v0.1.22-b4/evidence/`。

最终本地开发签名 IPA：`artifacts/ios/v0.1.22-b4/device-debug/nanoPlayer-0.1.22-b4-arm64-device-debug.ipa`，0.1.22 / 4、arm64、minimum OS 16；ZIP、签名/profile、版本、架构与 SHA-256 已核验。SHA-256：`6ff797ed29e707c6fb7357129edbe054a4e4009ecaacb25bb7559cedfecd401c`。尚未将本次最终 IPA 安装到真机，不沿用 0.1.21 的安装记录。

共享 UI 对应最终 Android APK：`artifacts/android/v0.1.22-b1022/debug/nanoPlayer-0.1.22-b1022-arm64-debug.apk`，0.1.22 / 1022、arm64-v8a、minSdk 29；ZIP/badging/SHA-256/APK v2 Android Debug 签名通过。SHA-256：`7cdd59ced2c0ecbb538ba67b043bde2c222430f8d6bc5cfd9c4d7620e0108d5d`，本次未安装到 Android 设备。截图复核前的 iOS 3 / Android 1021 包已被新预期构建取代，不能作为当前源码证据。

iPhone 模拟器 XCUITest 已通过：iPhone 18 Pro / iOS 27；结果 `artifacts/ios/tests/C3A4AA33-6DEC-47F9-9A55-17374C1271FE-1791982927845.xcresult`。iPad (A16) / iOS 27 同样通过，结果 `artifacts/ios/tests/510086B7-EEB8-4AD1-86F7-AF082F64916B-1791983874839.xcresult`。两者仅启动/导航/Wi-Fi 弹窗。真实歌曲播放页、最低 iOS 16 运行、系统大字体/VoiceOver、安全区/分屏及前述后台/Files/Wi-Fi 真机项仍待验收。

详细命令、失败与重跑、产物及权限边界见 [本次评审](../../archive/2026-10-14-ios-player-library-review.md)。桌面和网站发布由用户从 main 执行 `pnpm release 0.1.22`；本次未推送、打标签或发布。

## 0.1.23 三类资源库（2026-10-15，历史）

用户已确认 [资源库设计](LIBRARY_DESIGN.md)。已实现 nanoPlayer / Files / 其他音乐 App 三分区、独立来源 ID 和不冲突显示名、只读外部引用与部分范围索引；自有管理区支持新建/重命名、批量移动和删除空文件夹。导入、Wi-Fi 接收、系统打开音乐可选自有保存目标，外部文件仅复制，源字节不改动。旧授权迁移为 Files 来源，旧音频不搬移；管理区移动/重新授权通过日志和 Rust 路径事务保留 track ID、评分与歌单。

本次 60 Vitest、87 E2E、54 native rules、20 Rust tests（2 ignored，10k benchmark 另行通过）、23 release/iOS script tests、desktop/iOS Rust Clippy、fmt、website build、版本与文档路径检查通过。已人工复核 iPhone/iPad 浏览器深浅色与窗口截图及原生截图。iPhone 18 Pro、iPad (A16) / iOS 27 均通过原生“启动/导航/Wi-Fi 弹窗 → 新建文件夹 → 移动到收件箱 → 删除空文件夹”测试；文件夹为空，真实音频字节与 ID 保持由 native unit/Rust tests 分别验证。

证据：`artifacts/ios/tests/C3A4AA33-6DEC-47F9-9A55-17374C1271FE-1792019441838.xcresult`、`artifacts/ios/tests/510086B7-EEB8-4AD1-86F7-AF082F64916B-1792019542459.xcresult`；截图在 `artifacts/ios/v0.1.23-b5/evidence/`。

最终 IPA：`artifacts/ios/v0.1.23-b5/device-debug/nanoPlayer-0.1.23-b5-arm64-device-debug.ipa`，0.1.23 / 5、arm64、minimum OS 16；ZIP/版本/架构/profile/开发签名核验通过。SHA-256：`9023c331b6a86cd4bb3d5cd87e28721e1479d4bba9208f7d79b9719be566712c`。本次未安装最终 IPA 到真机，不继承 0.1.21 的安装结论。

对应 Android APK：`artifacts/android/v0.1.23-b1023/debug/nanoPlayer-0.1.23-b1023-arm64-debug.apk`，0.1.23 / 1023、arm64-v8a、minSdk 29；ZIP/badging/APK v2 Android Debug 签名通过。SHA-256：`0a757a3012ea827be87139d297033635d4cdd9e031e5cdfce833941f9bebee09`。本次未安装 APK，未改 Android 原生队列/文件逻辑，JVM/instrumentation 未重复执行。

仍待真机验收：Files/iCloud/真实第三方 App 的授权/云端未下载与失效恢复、系统音频打开方式、真实 Wi-Fi 上传与断网/空间不足、带合成音频的进程中断/升级恢复、暂停当前歌曲移动后继续播放与统计、后台音频、最低 iOS 16、系统安全区/分屏/大字体/VoiceOver。其他 App 必须公开可选文件夹，不访问其私有或 DRM 缓存；后台 Wi-Fi 接收不在范围内。

完整命令与边界见 [实现记录](../../archive/2026-10-15-ios-library-implementation.md)。当前桌面交接命令为 main 上的 `pnpm release 0.1.23`，旧版本命令只属历史。本次未执行推送、标签、桌面或官网发布。


## 0.1.24 资源库重新设计（2026-10-16，历史）

### 已实现

- 自有目录与外部只读来源两区；只允许首页一级目录参与勾选。子目录和歌曲不再有勾选框，文件管理使用单项菜单。审核原型的“查看参与音乐库的歌曲”按钮未加入正式界面。
- 自有目录使用持久 UUID 和文件身份；根层音频独立显示。集合筛选、混合歌单、前端队列及 Swift 原生恢复队列共用参与语义。旧全选/全取消仅迁移一次，新来源默认加入；旧部分索引保留，确认整个来源前不扩大范围。
- Files 引用先系统选取、再确认；确认前无来源记录/索引，取消释放授权。复制有独立入口和目标选择；系统打开提供取消并清理暂存。外部音频不写回、不静默复制。
- 功能名统一为“Wi-Fi 传输”。配对后浏览整个自有管理区，可新建/重命名/移动目录、删除到私有回收站、恢复/指定目标恢复/彻底删除，并进入任意层级上传。浏览器会话独立、可注销，停止后全部失效；目录数据需认证、目标用不透明 ID、写入检查 revision 和忙碌状态。
- 原生串行协调器复用路径/符号链接检查、移动日志和冲突规则。回收站位于应用支持区，数据库用不参与扫描的路径墓碑保持歌曲 ID、评分与歌单。上传分项落位后同步索引；停止时等待最终扫描，避免遗漏最后一批文件。
- Apple Music 与网易云私有库没有伪造连接。当前只接公开 Files 目录；Apple Music 官方授权与独立播放适配仍属单独阶段。

### 验证与剩余边界

最终命令、产物、模拟器结果、截图与签名以 [本次实现记录](../../archive/2026-10-16-ios-library-redesign.md) 为准。64 项 Vitest、89 项 E2E、75 项 Swift 原生规则断言、21 项 Rust 测试和单独 10k 基准、23 项脚本测试、15 项 Android JVM 测试及网站构建通过。iPhone 18 Pro、iPad (A16) / iOS 27.0 的 build 7 各通过 2 项原生测试，包含真实 HTTP 指定目录上传。macOS 生产接收器与 Chromium 的会话、目录、上传及回收站回归通过；已人工查看浏览器与原生截图。最终 iOS 开发签名 IPA 和 Android 1024 调试 APK 的版本、架构、SHA-256、ZIP 和签名已核实；两者均未安装真机。

仍需真机验收：Files/iCloud/真实公开 App 目录授权与失权恢复、真实系统打开分享、不同设备浏览器的 Wi-Fi 隔离/断网/空间不足、带音乐的升级与进程中断恢复、后台/锁屏播放、最低 iOS 16、大字体/VoiceOver/分屏。macOS 接收器回归不代表 iOS 设备验收，模拟器上传也不证明真机局域网权限。Android 本次无连接设备/模拟器，已生成本地调试包，未安装验收。

桌面由用户在 main 执行 `pnpm release 0.1.24`；本次不推送、不创建标签、不运行远程工作流或网站部署。

## 0.1.25 只读歌曲置灰修复（2026-10-16，历史）

- 移除目录搜索；仅在 iOS 资源库页面隐藏全局歌曲搜索。歌曲、艺术家、专辑等音乐页面保留搜索。
- 真机数据库中 3 个外部来源均可用，共 498 首；旧 `selectedRootIds` 仅包含第一个外部来源，新加两个来源的 132 首被 `TrackTable` 错误按旧规则置灰。列表缺少 `libraryScopes` 订阅，现与集合、歌单、播放队列使用相同一级目录参与规则。没有重置用户勾选、重授权、复制或改写音频。
- 启动时 iOS 延迟旧来源筛选，等待一级目录状态加载后统一筛选恢复队列，避免提前丢掉仍参与音乐库的当前歌曲。
- 新增浏览器回归覆盖旧来源 ID 与新只读来源、正常点播、取消勾选后的混合歌单置灰。64 项 Vitest、90 项 E2E、21 项 Rust 测试和独立 10k 基准、23 项脚本测试、75 项 Swift 规则断言、网站构建、Rust fmt/桌面 Clippy/iOS 16 simulator Clippy 通过。
- 已在 iPhone 15 Plus 覆盖升级至 0.1.25 / build 9，核对版本；真机 XCUITest 确认原来受旧筛选影响的来源中的第一首歌曲播放按钮启用、点播后出现暂停按钮、最后暂停。仅证明此条点播路径，不代替长时后台、全格式解码及音频输出验收。测试未卸载应用、删除资料库或修改源音频。
- 最终 build 9 的 iPhone 18 Pro 与 iPad (A16) / iOS 27.0 模拟器各 2 项资源库/HTTP 上传测试通过；真实歌曲点播用例在无歌曲的模拟器各跳过 1 项，真机独立通过 1 项。
- build 8 为搜索调整未完成时的中间安装包；最终 IPA 使用 build 9。Android 对应最终调试 APK 为 versionCode 1026，arm64-v8a、APK v2 调试签名，未安装 Android 设备。iOS 最终 IPA 为 arm64 开发签名。版本、SHA-256、完整性和签名见各自 artifact manifest 与 `artifacts/verification/v0.1.25/`；打包时 manifest 的 installed=false 由独立真机安装证据补充。
- 已知独立问题：其中一个外部来源的 98 首数据库歌曲 title/artist/album 标签为空，导致列表文字为空；本次未改写源标签，也未把此问题误判为引用授权失败。标题回退与存量空元数据修复仍待处理。

真实 iCloud 下载/授权失效恢复、Wi-Fi 跨设备故障、长时后台/锁屏、最低 iOS 16 与无障碍等原有边界继续保留。本次无桌面/官网公开发布；如需发布，由用户在 main 执行 `pnpm release 0.1.25`。

## 0.1.26 空标签文件名回退（2026-10-16，当前）

- 0.1.25 真机发现的 98 首空文字元数据已通过读取时回退处理：标题为空或只有 Unicode 空白时显示完整文件名（保留扩展名）；正常标签保持优先。缺失艺术家/专辑分别显示“未知艺术家”“未知专辑”。
- 新扫描统一过滤空标签；SQLite snapshot 对存量空标签直接回退，读取相对文件名而非 document URI，Android 内容 URI 同样能保留真实文件名。无需重新引用、重新扫描或持久化迁移；不改写源标签、raw tags、歌曲 ID、评分、播放统计及歌单关系。
- 新增合成 WAV 空标签与正常标题测试，扫描读取前后音频字节相同；存量空标签数据库测试覆盖重复读取、无重扫、ID/评分/歌单保留及正常标题不被覆盖。Rust 24 项通过，2 项默认忽略中的 10k 搜索基准独立通过；64 项 Vitest、90 项 E2E、23 项脚本测试、75 项 Swift 规则断言、网站构建及 Rust fmt/桌面 Clippy/iOS 16 simulator Clippy 通过。
- 真机截图确认原来空白的列表行和底部播放器显示文件名，独立 XCUITest 1 项实际通过：确认空白行不再出现、原歌曲可点播、显示暂停状态并最终暂停。定位使用恢复后的“播放 + 文件名”按钮名称；旧精确“播放”定位导致的一次用例跳过不作为播放证据。iPhone 18 Pro 与 iPad (A16) / iOS 27.0 模拟器各 2 项资源库/真实 HTTP 上传通过，空库的真实歌曲播放用例各跳过 1 项。
- 最终 iOS 0.1.26 / build 10，arm64 开发签名 IPA；Android 0.1.26 / versionCode 1027，arm64-v8a、APK v2 调试签名，未安装 Android。产物清单、SHA-256、签名、真机和模拟器日志见 `artifacts/verification/v0.1.26/`；打包 manifest 中 installed=false 是打包时状态，安装结果单独保存。

原有真实云端下载/失权恢复、全格式音频输出、长时后台/锁屏与无障碍边界继续保留。桌面/官网未发布；用户在 main 执行 `pnpm release 0.1.26` 进行发布。
