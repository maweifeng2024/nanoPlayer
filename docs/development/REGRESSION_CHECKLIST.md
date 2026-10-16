# 开发修改后的复核与回归规范

本规范从项目历史对话中的用户反馈、复现记录和现有验收文档提炼而来。目的是防止同类问题再次出现，不代表下列场景已经全部验收。命令以 [命令参考](COMMANDS.md) 和可执行脚本为准；发布权限与版本规则以 [AGENTS.md](../../AGENTS.md) 和 [发布流程](../release/RELEASE_PROCESS.md) 为准。

## 每次修改都要做的复核

1. 明确影响范围：共享 UI、状态、Rust 核心还是特定客户端。共享修改必须检查桌面、Android 手机和 Pad；不要只验证反馈问题的单个页面。
2. 对照用户最新确认与 [设计规范](../design/DESIGN_SYSTEM.md)，保留菜单顺序、主题选择和已有交互。历史备选方案不覆盖用户最终选择。
3. 执行 `git diff --check`，审查修改文件、意外格式化、生成文件及私密数据。测试夹具使用可再分发或合成媒体；涉及文件系统的测试必须证明源音频字节不变。
4. 可执行修改运行 `pnpm check`；它包含 lint、设计 token 检查、Vitest 和前端构建，**不包含** E2E、Rust、Android 原生或官网检查。再按下表追加检查，准备产品版本时执行发布流程要求的完整本地门禁。
5. 记录本次实际执行命令、通过/失败/未执行、源版本、产物及证据路径。不能把历史测试数量、旧截图或旧安装包当作本次验证；修改后先重建、再验证对应安装包。

**纯文档例外：**只做差异、相对链接/路径和内容一致性检查，确认代码、测试、脚本、工作流、构建配置、版本、打包与发布元数据未变化。不为文档修改分配版本、构建安装包或运行发布操作。

## 按改动范围追加的检查

下表列的是修改相关行为后必须覆盖的场景。已有测试文件是入口，不代表已覆盖整行全部要求；缺口需要补测或明确记为待验收。

| 改动或历史问题 | 必须复核的行为 | 验证入口与证据 |
| --- | --- | --- |
| 字号、按钮、共享 CSS、响应式布局反复回归 | 桌面深/浅色、720px 窄窗；手机 360/390px；Pad 600/840/1024px。检查字号、触摸区域、间距、溢出、固定播放器、弹层及安全区。600–900px Pad 保留固定图标侧栏与桌面菜单顺序，隐藏文字后仍有可访问名称；手机保留自己的导航。额外检查断点两侧、旋转、大字体及系统分屏 | `pnpm check:ui`；`tests/e2e/ui-visual.spec.ts`、`android-layout.spec.ts`、`typography.spec.ts`。截图人工对照；系统旋转/分屏/大字体需要原生设备证据 |
| 播放标识与专辑图重叠、封面和主题退化 | 全部歌曲、艺术家详情、专辑、歌单、队列及其他复用列表的播放/选中状态；播放标识与封面之间的留白。真实封面、缺失封面、艺术家完整名称、长名称；浅色封面染色与顶部过渡。Android 首页保留用户最终确认的 16% 底色、无模糊方案 | `tests/e2e/october-upgrade.spec.ts`、`library-refinements.spec.ts`、`ui-visual.spec.ts`；人工查看桌面/手机/Pad截图。不要用某一列表的通过结论代替全部复用上下文 |
| 更多菜单、键盘与触摸冲突 | 同一三点按钮第一次打开、第二次关闭；点击外部、Escape、Android 返回关闭顺序；关闭后焦点恢复。按钮 Space 激活不触发全局播放；长按打开原菜单，拖动/滚动取消长按。桌面专属菜单调整不能误改手机/Pad | `tests/e2e/playback-ui-fixes.spec.ts`、`ui-refactor.spec.ts`、`preferences-and-statistics.spec.ts`；Android 原生触摸/返回检查 |
| 资料库勾选与列表、播放队列不一致 | 默认全选、部分选择、全取消、恢复全选；歌曲/专辑/艺术家/搜索/收藏等集合一致过滤。混合歌单显示且排除项置灰、播放跳过；全排除歌单隐藏。切换后原生队列及恢复会话同步，当前歌曲仍被选中时保留歌曲/进度。资料库详情保持完整来源、原添加日期与计数；支持 SAF 根 ID/URI | `src/library/librarySelection.test.ts`、`tests/e2e/library-selection.spec.ts`、`library-refinements.spec.ts`、`collection-queue.spec.ts`；Android 队列原生测试及重启检查 |
| 大资料库勾选卡顿，前端优化后手机仍 ANR | 用合成 10,000 首检查筛选、滚动、末尾集合与有界渲染；多次勾选/取消且持续交互。Android 大队列分别覆盖当前歌曲保留/移除、暂停/播放、乱序/重复和恢复。避免逐首原生队列移动、主线程大 JSON 解析/权限校验及重复全库扫描 | `tests/e2e/september-review.spec.ts`、`src/platform/android.test.ts`、原生 `QueueOrderTest.kt`/`QueueUpdateTest.kt`；设备记录队列规模、状态、每次响应时间、观察时段与新增 ANR。卡死先核实安装版本，采集 logcat、exit-info/ANR 线程栈，定位 WebView、Rust 或媒体服务层；浏览器速度不能证明原生修复 |
| 升级后数据库与状态结构不兼容 | 旧库首次迁移、重复启动幂等、迁移失败事务回滚、未来 schema 拒绝；保留资料库、稳定 track ID、评分、歌单、统计、偏好与恢复队列。旧偏好缺字段、非法数值/结构有受控默认和写回，不静默重置全部数据。升级安装尽量保留旧数据验证 | Rust 数据库迁移测试、`src/playback.test.ts` 与 Android journal instrumentation；使用旧结构夹具和升级安装。前端演示数据不能代替 SQLite/原生 journal 的升级测试 |
| 歌词展示、偏移、缓存与在线查询 | 普通 LRC/Enhanced LRC、损坏或缺失时间轴、多行同时间；逐字显示依据真实时间轴。切歌、暂停、seek、正负偏移及字号持久化；抽屉与展开页一致。手动/离线优先，在线查询明确 opt-in；失败或断网不打断播放。避免随每次进度更新重复解析 | `src/lyrics/lrc.test.ts`、`tests/e2e/october-upgrade.spec.ts`、Rust 歌词相关测试；跨歌曲和重启复核 |
| 耳机断开、输出切换后静音或无响应 | 模拟音频回调停止后连续切歌/跳转可返回；默认设备变化、显式设备消失、无可用输出、输出停滞；保留歌曲/进度/音量并暂停，界面同步暂停且可手动恢复；有线/蓝牙重复断开与重连 | `audio::tests`、`preferences-and-statistics.spec.ts` 原生暂停同步；桌面与 Android/iOS 真实音频路由验收单独记录，模拟测试不代替硬件拔插 |
| 后台播放、计数、定时结束依赖 WebView 生命周期 | Activity/WebView 销毁后播放继续；进程恢复不自动播放；自然播放计数一次，暂停/seek不误计，重复事件/旧确认不丢失新进度。定时 15/30/60 分钟、自定义上下界、取消/替换、立即停止/播完当前歌曲；后台/锁屏、循环和关服务语义 | 原生 `ListeningSessionTest.kt`/`SleepTimerStateTest.kt`、`src/platform/android.test.ts`、`tests/e2e/october-upgrade.spec.ts`；`pnpm android:test:emulator [模拟器序列号]` 与设备锁屏/长时检查。JVM 状态测试不能代替真实媒体服务、厂商省电策略验收 |
| SAF 权限、重扫、元数据与缓存 | 权限丢失/恢复、损坏媒体、重扫及重复导入保留 ID 和用户数据；非 seek/cloud provider 失败可恢复。评分、歌词和封面缓存写入应用管理区，源音频前后 SHA-256 一致 | Rust 文件系统测试、Android SAF/原生 instrumentation、`tests/fixtures/`；使用合成文件，不添加个人音乐或将私密路径/媒体写进报告 |
| 发布前通过前端测试但 Rust CI 失败；错误建议 resume | Rust fmt、Clippy warnings denied、测试和默认忽略的 10k FTS 基准均独立执行。发布/恢复检查失败阶段、标签与源提交身份、原始构建成功且产物存在。标签前本地失败重跑同版本；已打标签的源码构建失败不能靠重复 resume 修复或移动旧标签，需要修复后新版本 | 下方本地门禁及 `scripts/release/*.test.mjs`。已有标签仅在推送/工作流/发布中断且来源满足要求时恢复；不运行远程流程来验证文档或完成实现 |

## 本地门禁与证据层级

准备可执行产品版本时，以发布流程与当前脚本核对门禁，至少包括：

```sh
pnpm check
pnpm test:e2e
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml database::tests::search_benchmark_10000_tracks -- --ignored --exact
node --test scripts/release/*.test.mjs
pnpm website:build
```

Android 修改追加插件 JVM 测试、适用的原生 instrumentation 和本地 APK 构建验证。原生测试路径见 [Android 状态](../clients/android/STATUS.md)；已有模拟器公共入口为 `pnpm android:test:emulator [模拟器序列号]`。不要把仅支持模拟器的入口当作真机测试命令，也不要为尚未实现的客户端编造命令。

- 浏览器测试证明共享展示与交互；原生单元测试证明对应算法/状态；安装后的模拟器/真机检查证明该设备和场景。三类结论分别报告。
- iOS 修改追加 `pnpm ios:test:unit` 与 iOS 16 的 Rust/Swift 编译/Clippy；有运行时后在 iPhone/iPad 分别执行 `pnpm ios:test:simulator <UDID>`。共享 UI 改动同时覆盖 iPhone/iPad 的浏览器布局。后台音频、Files 授权、Wi-Fi 接收、升级和签名仍需原生设备验收，详细清单见 [iOS 流程](../clients/ios/WORKFLOW.md)。
- 声称卡死修复需有复现步骤、修复前定位证据、修复后同规模/同路径重复操作与新增 ANR 检查；未连接设备时标为“原生设备待验收”。历史 3,284 首队列的通过次数与耗时不是固定性能阈值，也不是今后版本的保证。
- UI 变更先查看截图差异、修正问题，再更新有意变化的快照并重跑相关测试；不能只更新快照来让失败变绿。虚拟列表使用稳定语义 ID/名称定位，滚动后不复用 DOM 数字索引。
- 浏览器启动即关闭、缓存 `Operation not permitted` 等先按环境故障定位；修复权限/运行环境后重跑，不删除断言或改业务行为迁就环境。报告失败和重跑结果。
- 升级/队列测试显式设置 shuffle、repeat、选择与播放状态，防止旧持久状态污染前置条件。设备检查后恢复用户原选择和播放/暂停进度。
- 验证报告记录日期、版本/提交、客户端、设备/系统、数据规模、命令、结果、截图/日志路径及未验收项。只保留必要且脱敏的证据。

## 打包与交付复核

执行权限仍遵守 AGENTS.md：桌面构建发布、推送、标签、远程流程和官网部署交给用户；Android 在本地完成适用构建验证。纯文档修改无需任何发布命令。

可执行修改使用同一新语义版本，Android build number 每个预期构建只分配一次，失败重试复用该次编号。先同步/校验版本，再 `pnpm release:android -- --debug`。交付必须核实本次 APK 路径、versionName/versionCode、ABI、ZIP 完整性、SHA-256 和签名，并区分调试签名与生产签名、已安装与仅打包。旧 APK 不作当前证据；清理输出前保留本次产物与 manifest/checksum/signature/设备证据。

提交源码、CI 构建产物、公开发布是三个独立事实。最终说明本地完成内容、未验收项和仅剩的用户命令；不要额外建议发布脚本已经包含的 `git push`，不要推荐 `--skip-checks` 发布。

## 提炼依据与维护

- 2026-09-19 至 09-23 的手机/Pad UI 对话：菜单二次点击关闭、字号/间距、窄 Pad 图标侧栏、透明顶部与截图回归；对应 [设计规范](../design/DESIGN_SYSTEM.md) 和 [Android 状态](../clients/android/STATUS.md)。
- 2026-09-27「完善资源库筛选和客户端界面」：跨集合筛选、混合歌单、主题控件、最终卡片选择及桌面发布权限。
- 2026-10-13「UI、歌词功能、bug修改」：播放标识重叠、歌词与升级迁移；随后 v0.1.15 Rust Clippy 构建失败与恢复失败。对应 [归档评审](../archive/2026-10-13-ui-lyrics-upgrade-review.md) 和发布脚本。
- 2026-10-13 艺术家封面/资料库卡顿对话及 USB 手机追查：0.1.17 前端优化后用户仍反馈卡死，0.1.18 通过线程栈定位原生逐首移动队列阻塞；对应 Android 状态中的真机记录。

上述历史用于说明检查项来源，不替代当前验证。新增同类缺陷时，将可复现触发条件及回归入口补到对应行；当前状态文档如出现旧“未连接真机”与新设备证据并存，应按日期和版本明确限定范围，不能用旧条目覆盖新证据。
