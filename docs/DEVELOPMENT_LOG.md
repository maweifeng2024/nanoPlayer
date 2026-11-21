# 开发任务记录

## 2026-11-09 15:48（Asia/Shanghai，UTC+08:00）— 本地构建、首页与播放推荐可行性

- 已完成静态核对：桌面发布入口关联 GitHub 工作流；Android/iOS 已有本地构建入口。拟新增不触发远端的 macOS 构建路径，暂停 Windows，区分构建、签名与发布。
- 已完成静态核对：首页复用 `src/library/ContentPage.tsx`，各区展示上限 12；移动端列表行高与手机网格均在 `src/design/consistency.css` 有约束。拟以 Android 为移动首页基线，同步验证 iOS、Android 手机和 Pad。
- Android 暂停续播：已定位原生服务入口，未复现或确定根因。ADB 未列出设备；iOS 设备查询超时。下一步在 Android 真机收集原生队列、当前曲目、进度及媒体控制事件，随后复测 iOS 首页。
- 推荐：拟由客户端从全库筛选符合播放次数条件的候选，Cloudflare Worker 调用 Workers AI 仅排序候选 ID；缓存、生成周期及实际队列均在本地。模型质量、token 数、费用及防滥用措施仍需验证。
- 本轮仅分析，未修改实现、脚本、版本或测试清单，未执行构建、功能回归或部署。开发前先细化验收清单并为设备场景补齐证据。

## 2026-11-09 16:00（Asia/Shanghai，UTC+08:00）— Git 合并中断排查

- 已核对：本地 `main` 与 `origin/main` 各领先 1 个提交，`MERGE_HEAD` 为 `641c9ee`，无未解决冲突。唯一暂存项是网站下载清单；合并提交因全局编辑器 `code --wait` 无法运行而未完成。
- 已提供用默认消息完成合并、再由用户推送的命令。未执行提交、推送、构建或发布；待用户完成并检查远端结果。

## 2026-11-09 19:27（Asia/Shanghai，UTC+08:00）— 复核 0.1.32、三端调试构建与推荐服务部署准备

- 已核对本地 `main` 的 `17a1477`，包含共享界面、iOS 样式、推荐客户端、独立 Worker 及测试。推荐与回归入口见 [验收清单](development/RECOMMENDATIONS_VERIFICATION.md)。保留该提交已分配的 0.1.32，同步 iOS build 14，Android 从上版 1032 递增到 1033。已复核 AGENTS.md，现有发布及验收边界适用。
- 已完成 Mac arm64 调试 app，版本 0.1.32。对本地包重做临时签名后通过 `codesign --verify --deep --strict`。应用路径 `src-tauri/target/debug/bundle/macos/nanoPlayer.app`，主程序 SHA-256 `87362fbb768ffb90de0b4bc0576eaa425b88007edf1dd12cb60e024d89022459`。未执行启动验收。
- 已完成 iOS arm64 模拟器构建，版本 0.1.32/build 14，核验 Info.plist 平台为 iPhoneSimulator。ZIP 和校验文件位于 `artifacts/ios/v0.1.32-b14/simulator/`。模拟器归档无发行签名。
- 已完成 Android arm64-v8a 调试 APK，版本 0.1.32/versionCode 1033，minSdk 29，产物和校验文件位于 `artifacts/android/v0.1.32-b1033/debug/`。已核对包元数据、ZIP、APK v2 签名及 SHA-256。ADB 无设备，真机安装与启动待验证。早期 1032 包重复上版编号，已用 1033 产物替代交付。
- 已通过 `pnpm check`（78 项 Vitest、3 项 Worker mock），Rust fmt、Rust 测试（26 通过、2 忽略）、发布脚本测试（19 通过）、iOS 原生规则测试（75 项）。Worker Wrangler dry-run 通过。Workers AI 实际输出、响应式外观和原生设备行为需要单独验收。
- 已导出 iOS arm64 真机调试 IPA，0.1.32/build 14，包标识 `app.nanoplayer.ios`、最低 iOS 16.0，核对 ZIP、开发签名和内嵌 provisioning profile。产物和 SHA-256 位于 `artifacts/ios/v0.1.32-b14/device-debug/`。未安装至设备。
- 用户确认供应商为 AICodeMirror、模型 `gpt-6-astra`。Worker 已接入 Responses API，保留原 Workers AI 配置路径，非法 JSON/空曲目修正为 400。更新了设计、验收清单和 Worker 配置文档。对指定模型无密钥探测返回 401，未调用付费推理。补充 mock 覆盖上游请求、候选过滤、缺密钥、上游错误和非法输入。复跑 `pnpm check`（78 项 Vitest、5 项 Worker mock）、Wrangler dry-run、Rust Clippy 和 10k FTS benchmark 均通过。
- 部署阻塞。Wrangler 本机登录过期，`recommendations.nanodo.cc` 尚无可解析记录。下一步刷新现有账号登录，部署独立 Worker、绑定子域名、由用户录入 `MODEL_API_KEY`，然后用合成歌曲做在线推理和三端连通验收。当前调试包使用本地推荐。未执行 Git 提交、推送、远端 CI 或正式发布。
- 浏览器验收：沙箱内 Chrome 预检 SIGABRT，沙箱外预检通过后执行。完整套件截至交付记录 108 个通过、1 个因未设置模拟 endpoint 跳过、6 个截图基线未出结果。另以拦截的测试 endpoint/令牌复跑推荐套件，5/5 通过，包含桌面、手机、Pad 保存与队列回归。日志及三端推荐截图位于 `artifacts/verification/v0.1.32/`。未将截图基线或真机验收计为通过。官网构建通过。

## 2026-11-09 19:48（Asia/Shanghai，UTC+08:00）— 推荐 Worker 首次部署

- 已完成：用户刷新 Wrangler OAuth 后，核实当前账户下尚无同名 Worker。部署独立 `nanoplayer-recommendations`，绑定 `recommendations.nanodo.cc`，关闭 workers.dev 和预览 URL。首次部署版本 ID 为 `f130f3b0-d4bc-4073-ae68-e134755e2333`，之后写入独立随机 `APP_TOKEN` Secret。已将本地构建用地址和令牌保存至 Git 忽略、权限 0600 的 `.env.local`。
- 验证：Worker 单测 5/5、Wrangler dry-run 和差异检查通过。权威 DNS 返回记录，通过该记录验证实际 HTTPS 路由。未认证 POST 返回 401，应用令牌认证后使用合成歌曲提交返回 503，符合模型 Key 未配置时的约定。本地递归 DNS 仍可能缓存此前的否定结果。
- 待完成：用户在 Worker 中设置 `MODEL_API_KEY`，再执行实际推理、客户端联通验证及在线推荐构建。未提交、推送或触发客户端 CI。本轮仅部署后端及配置路由，无客户端版本变更。部署配置和运维步骤已同步至 Worker README，现有 AGENTS.md 边界适用。

## 2026-11-09 20:03（Asia/Shanghai，UTC+08:00）— 线上推理与三端在线推荐调试包

- 已完成：Cloudflare 识别用户录入的 `MODEL_API_KEY`。线上首次合成请求返回 502。诊断定位 TypeError，改用手动处理上游重定向并拒绝非 2xx 响应后恢复。移除临时诊断入口后部署 Worker 版本 `e7abdf54-3295-46c2-9163-15b4bbaaf688`，合成请求返回 200，仅返回合法候选 ID 2。三种 Tauri Origin 预检均为 204 并回显来源。此机默认递归 DNS 仍返回 NXDOMAIN，HTTPS 验证使用权威 DNS 返回的 IP 保留原始 TLS 域名。普通 DNS 与原生设备联通待复核。
- 已完成：选用本地与远端均无标签的 0.1.33，分配 iOS build 15 和 Android versionCode 1034。已验证版本、arm64 架构、ZIP、签名、SHA-256，并逐包验证压缩前端资源包含 Worker 地址及应用令牌。未安装或启动新包。
- 产物及校验文件位于 `artifacts/mac/v0.1.33/`、`artifacts/ios/v0.1.33-b15/device-debug/`、`artifacts/android/v0.1.33-b1034/debug/`。Mac 临时签名，iOS 开发签名和内嵌描述文件，Android APK v2 调试签名。未提交、推送或触发 GitHub CI。
- 已执行：版本校验、差异检查、`pnpm check`、Worker 5/5、Rust 26 通过和 2 忽略、推荐浏览器 5/5。补记上轮完整浏览器套件最终为 108 通过、1 跳过、6 个截图基线比较失败。当前未重跑截图基线或完整发布门禁。复核推荐设计与实现后更新变更日志、Worker README 和验收清单，现有 AGENTS.md 边界继续适用。

## 2026-11-09 20:06（Asia/Shanghai，UTC+08:00）— iPhone 安装

- 已通过 CoreDevice 将 iOS 0.1.33 build 15 调试包安装到 iPhone 15 Plus。系统确认安装成功。启动请求因设备锁屏被拒绝，待解锁后验证启动。未变更应用源码。

## 2026-11-13 14:30（Asia/Shanghai，UTC+08:00）— 本地构建产物清理

- 已完成：按当前 0.1.33 开发进度扫描 Git 忽略目录、构建脚本及验收记录。删除 37 个旧移动端安装包（Android 24 个、iOS 13 个）、Gradle 原始 APK 输出目录、Next 构建缓存、两个 TypeScript 增量状态文件、Playwright 上次运行索引及过期卡片预览。按删除前分配块合计约 6.79 GiB。
- 保留：0.1.33 三端调试包、0.1.32 Android build 1033 和 iOS build 14 安装包、旧版本签名/校验清单与测试证据、当前 iOS 归档、前端输出、官网静态输出、依赖、原生编译缓存和本地配置。历史记录中部分旧安装包路径仅供追溯。
- 验证：删除范围均为 Git 忽略且未跟踪路径。保留的六个安装包通过 SHA-256 复核，版本一致性和差异检查通过。仓库仅新增本日志，现有设计、实现、测试清单和 AGENTS.md 继续适用。
- 未执行：构建、功能回归、设备安装及发布。本次无可执行输入变更，缓存和中间输出由后续常规构建按需生成。

## 2026-11-18 08:00（Asia/Shanghai，UTC+08:00）— 后台续播、个性化推荐、首页与逐页审阅

- **PLAY-1118 已实现，原报告场景部分验收。** `src/platform/android.ts` 和 `NanoPlayerPlugin.kt` 把已有队列的播放切换交给原生当前状态，避免页面快照触发队列重建。升级安装 0.1.34/1035 后，双曲顺序队列、重复关闭：系统媒体命令后台暂停「我」于 316.124 秒；调用原生命令恢复，同曲至 316.634 秒；自然切到「绿光」；将「绿光」定位到接近结束后，自然播完时停在该曲、队列结束。恢复了原 12 首队列及「晚风」25.461 秒暂停状态。0.1.33 只有不同队列的现场快照，未复现用户当时的序列；新包的同曲进度和自然切歌通过，原始队列、锁屏点击和特殊音频焦点事件仍待复验。Android 原生 JVM 15 项通过，含现有队列顺序及更新回归。
- **REC-1118 已实现并通过模拟服务验收。** 评分、播放频次、最新播放参与本机候选和补齐排序，保留提交轮换、合格范围和发送字段。请求构造与当前设计见 [推荐架构](architecture/RECOMMENDATIONS.md)。本地拦截请求的推荐 E2E 5 项通过，覆盖隐私边界、桌面/iPhone/Pad 存储和启用设置；真实在线模型输出未测。
- **HOME-1118 已实现并通过颜色插值和响应式检查。** 桌面与 iOS 首页优先使用当前曲目，Android 固定渐变锚点，900 ms 缓出。桌面 1440、Android 手机 390、Pad 840 测得起点/插值/终点，减少动态效果时禁用过渡。现有真实/缺失封面、浅色融合和迟到封面请求用例通过。设计见 [首页设计](design/DESIGN_SYSTEM.md)。
- **逐页审阅已完成。** 同一浏览器合成曲库下覆盖 14 个页面 × 3 个视口，42 张截图，无页面异常或文档横向溢出。播放器详情、空统计、空歌单用例被纳入。原生 Android 手机附加查看首页与播放状态；Pad 截图为浏览器模拟。
- **公共门禁。** `pnpm check` 通过（80 Vitest、5 Worker 用例及构建），Rust fmt、Clippy、测试（26 通过、2 默认忽略）、10k FTS 单独通过；发布脚本测试 19 项、官网构建、版本一致性及 diff 检查通过。iOS 单测 75 项通过，模拟器 arm64 archive 为 0.1.34/build 16；未运行 iPhone/iPad 原生界面或真机安装。首次 Chrome 预检 SIGABRT，沙箱外重试通过；未改变应用以适配测试环境。109 项浏览器功能用例通过；独立运行 6 项视觉快照均有差异，原提交在相同宿主重跑同样 6 项失败。保留原快照，视觉发布门禁仍待校准。
- **交付。** Android ARM64 调试 APK 位于 `artifacts/android/v0.1.34-b1035/debug/`，ZIP、元数据、SHA-256、APK v2 调试签名通过，并已 ADB 覆盖安装。逐页截图、三端总览与本轮验证日志位于 `artifacts/ui/2026-11-18/`。未提交、推送、触发 CI、打标签或发布。AGENTS.md 已复核，现有规则覆盖本轮。

### 逐页改进建议

| 页面 | 建议 |
| --- | --- |
| 首页 | 推荐卡显示一句「为什么推荐」，如「你近期常听这位歌手」。小屏没有统计时折叠空卡片，为最近专辑留空间。 |
| 资料库、扫描问题 | 目录行直接显示待扫、授权过期或可用状态。扫描问题页在非空时按权限、格式、文件损坏分组，各组给对应动作。 |
| 歌曲、最近添加、高评分 | 手机把批量选择、数量、排序压成一行；筛选或排序激活时保留可见状态。高评分页补充快捷改分入口。 |
| 最近播放、播放最多 | 空状态解释统计记录条件。已有数据时分别突出最后播放时间与次数。 |
| 专辑、艺术家 | 短列表减少宽屏卡片后的空白；长集合优先提供名称索引，重复默认封面增加可区分的首字。 |
| 歌单列表、歌单详情 | 空歌单突出「添加歌曲」；窄屏把低频编辑动作收进菜单，保留播放与添加。 |
| 正在播放 | 手机可折叠封面，优先给歌词留空间；Pad 横向摆放封面和歌词，减少单栏空白。 |
| 设置 | 统一各组行尾控件对齐，增加组标题导航；说明在线推荐关闭后仍可使用本地歌单。 |

## 2026-11-18 08:25（Asia/Shanghai，UTC+08:00）— 全页播放、队列加歌、菜单与推荐卡方案

- **UI-1118-01 已完成。** 正在播放和队列复用完整页面内容区，搜索与主导航退出此界面，底部播放控制保留。关闭队列后恢复原页面，收起正在播放使用原返回状态。手机可折叠封面，较宽 Pad 恢复封面与歌词双列。三尺寸专项确认过手机关闭按钮和窄 Pad 全宽栅格。
- **UI-1118-02 已完成。** 队列行通过现有歌单目标与持久化动作加入歌单。上移、下移和移除仍在菜单，行保留真实队列索引。合成曲目测试验证最后一行准确加入指定歌单。
- **UI-1118-03 已完成。** 行菜单互斥处理外部点击与触发点击，按可视空间选择上/下方并限制菜单高度。长菜单用 15 个合成歌单验证再次点击、关闭、Escape 和位置。保留 iPhone 长按底部面板与取消动作。Android 覆盖安装通过，手机后续重新锁屏，最终包真机手势未验收。
- **UI-1118-04 预览已完成，应用方案待用户选择。** 同一长描述展示 A 等高裁切、B 方封面与独立播放行、C 横幅封面，已有说明、预览交互及 390px 宽度检查。文件 `artifacts/ui/2026-11-18-round2/recommendation-card-options.html` 与同名 PNG。推荐卡的新布局和解释文字放在选型后实施。
- **上一轮建议。** 已实施手机工具栏紧凑间距、待扫描徽标、统计空状态说明、空歌单突出添加、关闭在线推荐的说明。现有扫描问题按权限等类别分组并可针对目录重扫。专辑/艺术家的名称索引、设置组导航、歌单低频操作收纳及授权恢复入口仍待实现。
- **构建与门禁。** Android 0.1.35/1036 arm64-v8a 调试 APK 验证 ZIP、SHA-256 和 APK v2 签名，覆盖安装版本已核对。iOS 0.1.35/build 17 arm64 iPhoneSimulator archive 已构建并核对元数据，未运行模拟器和真机验收。通过 `pnpm check`（80 Vitest、5 Worker）、Rust fmt/Clippy、26 Rust 测试（2 项默认忽略）、单独 10k 基准、75 项 iOS 原生规则、19 项发布脚本测试、官网构建、版本与 diff 检查。沙箱内 Chrome 启动 SIGABRT，沙箱外最小预检通过。遇热更新冲突后改用单个已运行的 Vite 服务复测，未改产品行为迁就环境。
- **交接。** 测试项见 [回归清单](development/REGRESSION_CHECKLIST.md)，设计见 [全页播放与菜单](design/DESIGN_SYSTEM.md)。Android 包和签名记录见 `artifacts/android/v0.1.35-b1036/debug/`；浏览器输出见 `artifacts/ui/2026-11-18-round2/`。前轮六项旧视觉快照门禁待校准。本轮未创建提交、推送、触发 CI、打标签或发布；AGENTS.md 现有规则仍适用。
- **最终浏览器验收。** 在新启动并核对源模块的新 Vite 服务上，相关 E2E 31 项通过，1 项因未配置模型测试 endpoint 跳过。覆盖 1440/390/840px 新增流程及 iPhone、Android、Pad、桌面的旧长菜单回归。旧服务曾提供修改前的菜单模块，复用该服务的失败记录不计入最终结果。手机已安装包的 SHA-256 与最终归档一致。

## 2026-11-18 09:43（Asia/Shanghai，UTC+08:00）— 推荐卡定稿与跨客户端排版复查

- **HOME-1118-AC/COVER/TOP 已完成。** 桌面及横屏 Pad 采用 A，手机及竖屏 Pad 采用 C。复用歌单封面选取，校验解码结果后合成最多四张真实封面；不可用项目不占格，全部缺失用歌单首字。压缩 Android 首页搜索栏下方留白。长文案、旋转、播放入口和封面部分/全部缺失通过浏览器验证。
- **QUEUE-1118-ROW/NAV 已完成。** 上轮手机隐藏拖动手柄后仍保留三列，歌曲内容及按钮被错放到前两列。队列现在使用与可见手柄匹配的列，文字占弹性区，更多按钮固定在右列。断言首行、活跃行及末行文字宽度、右侧按钮坐标、二次点击和加入歌单。手机队列及正在播放均保留首页、资料库、歌单三个入口，点入口退出队列并跳转。
- **LIST-1118-GUTTER/TOOLS 已完成。** Android 资料库封面左边缘与标题和工具栏对齐，播放标记仍有独立间距。窄屏普通浏览的筛选、排序和值和排序方向使用同一行；批量操作仍可分行。复查了 320px、有筛选状态及长排序标签。新增的长期几何验收要求已写入 AGENTS.md。
- **PLAYER-1118-NAV/TINT 已完成。** 桌面和移动收起按钮为透明、无边框的向下图标。桌面/iOS 共用当前曲目的首页配色组件，Android 继续共用外框背景调色。使用两套合成封面测试两页同曲配色一致，并尊重减少动态效果。桌面截图 `artifacts/ui/2026-11-18-v036/desktop-now-playing.png`。
- **全端复核。** 桌面、Android 手机/Pad、iPhone/iPad，分别扫描 17 个页面或展开状态，共 85 张截图；检测左右溢出、Android 各列表左边缘、手机工具栏各控件矩形和队列文字/操作列，浏览器无页面异常。全量 E2E 输出 122 通过、1 个未配置端点的模型测试跳过；包含逐张审阅后更新的六张首页视觉基线。最后一处 320px 排序控件内边距调整复跑了 85 页面审阅及 14 项 Android 布局和队列专项。Chrome 沙箱内 SIGABRT，按规则在沙箱外仅复试预检，通过后才执行浏览器回归。
- **构建与设备。** Android 0.1.36/1037 arm64-v8a 调试 APK 已构建，ZIP、SHA-256、APK v2 调试签名已核对。设备曾重连并成功安装早期 1037 构建，最终包完成时 ADB 再次无设备，最终包未覆盖安装和真机复验。iOS 0.1.36/build 18 arm64 iPhoneSimulator archive 已构建，模拟器运行及物理设备 UI 未执行。无桌面安装包、提交、推送、CI、标签或正式发布。
- **证据与后续。** 见 [回归清单](development/REGRESSION_CHECKLIST.md)、[推荐设计](architecture/RECOMMENDATIONS.md)、[界面规范](design/DESIGN_SYSTEM.md)。浏览器和构建日志位于 `artifacts/ui/2026-11-18-v036/`。上轮专辑/艺术家索引、设置分组导航、歌单低频动作及授权恢复待办仍开放。用户重连设备后安装最终 APK，再验收实际 WebView 的点击、旋转和字体设置。

## 2026-11-18 12:09（Asia/Shanghai，UTC+08:00）— 桌面侧栏、推荐封面矩阵及叠放满宽

- **PLAYER-1118-DESKTOP-SIDEBAR 已完成。** 桌面正在播放恢复常驻侧栏，1440px 与 720px 验证左侧导航和右侧播放器不重叠；手机底部入口及队列独立布局回归通过。更新的 1440px 截图在 `artifacts/ui/2026-11-18-v040/desktop-now-playing.png`。
- **HOME-1118-GALLERY/STACK/FILL 已完成。** 首个迭代使用横排伸缩，用户改为正方形相叠；随后的 0.1.39 Android 实机反馈右侧露出空白。0.1.40 根据真实封面张数和叠合宽度确定横幅比例。浏览器几何验证 2/3/4 张封面收拢到右边界，展开保留正方形且可横滑；通过键盘激活和减少动态效果。桌面、横屏 Pad 用实际专辑数合成矩阵，有 4 张时为 2×2。推荐播放按钮文字已缩短。矩阵与展开截图及测试日志见 `artifacts/ui/2026-11-18-v040/`。
- **测试、构建、安装。** `pnpm check` 通过（80 项 Vitest、5 项 Worker），全量浏览器 123 项通过、1 项因缺模型测试端点跳过，包含六种尺寸/主题视觉基线。Rust fmt、Clippy、26 项常规测试与 10k 搜索基准通过。0.1.40/1041 Android arm64-v8a 调试版已安装，设备 APK 的 SHA-256 与归档一致；最终原生触摸及截图采集因 USB 再次断开未完成。iOS 0.1.40/build 22 arm64 模拟器归档已构建，运行待验收。
- **文档与发布。** 见 [规则与界面](design/DESIGN_SYSTEM.md)、[推荐设计](architecture/RECOMMENDATIONS.md)、[回归清单](development/REGRESSION_CHECKLIST.md)。AGENTS.md 已复核，沿用现有几何验收和发布边界。未提交、推送、触发 CI、打标签或正式发布；桌面由用户从 main 运行 `pnpm release 0.1.40`。

## 2026-11-18 12:52（Asia/Shanghai，UTC+08:00）— iPhone 安装 0.1.40 与更新开发签名

- 已完成：使用现有 Apple Development 身份执行 iOS 真机调试构建，Xcode 重新生成与现有应用标识匹配、覆盖已连接 iPhone 15 Plus 的开发描述文件。描述文件有效期为 2026-11-18 12:44 至 2026-11-25 12:44（北京时间）。应用签名通过严格校验，arm64，版本 0.1.40/build 22，最低 iOS 16.0。
- 已完成：通过 CoreDevice 原地覆盖安装；首次启动受锁屏阻止，用户解锁后启动成功。设备应用列表确认已安装 0.1.40/build 22。归档见 `src-tauri/gen/apple/build/nanoplayer_iOS.xcarchive`。CoreDevice 在沙箱内初始化超时，沙箱外恢复。
- 本轮复用既有版本与安装流程，未修改运行时代码、测试、打包配置或公开元数据。未执行功能全量验收、IPA 导出、TestFlight/App Store 发布、Git 提交、推送或 CI。

## 2026-11-18 13:46（Asia/Shanghai，UTC+08:00）— 修复 Playwright 本机浏览器安装

- Playwright 1.55.0 项目依赖可解析，浏览器缓存缺 Chromium Headless Shell 和 FFmpeg，原安装进程运行逾 22 分钟。通过备用 CDN 下载后，安装器在解压阶段再次停滞。
- 已停止卡住的安装，校验 ZIP 完整性并补齐 Chromium 1187、Headless Shell 1187 和 FFmpeg 1011。安装清单识别三组件。沙箱内预检被 Mach 服务拒绝，沙箱外默认 Chromium 140.0.7339.16 启动通过，推荐页面 E2E 6 项通过。
- 本轮仅修复本机浏览器缓存。项目依赖、锁文件和运行时输入未改，未执行发布。当前验证范围为 Chromium，不包含 Firefox 和 WebKit。

## 2026-11-18 15:17（Asia/Shanghai，UTC+08:00）— 恢复桌面播放队列侧栏

- **桌面恢复已实现。** 对照 `1a40260^ → 1a40260`，队列全页布局曾在共享外框启用。现限定到移动端，桌面复用历史右侧栏与窄窗口浮层，保留当前页面。按 [设计规范](design/DESIGN_SYSTEM.md) 更新 [UI-1118-01 回归清单](development/REGRESSION_CHECKLIST.md)，并调整 `tests/e2e/full-player-menu.spec.ts` 的桌面入口、1440/720px 几何断言及移动全页回归。AGENTS.md 现行规则继续适用。
- **待用户确认。** 0.1.40 的其他交互差异包括桌面正在播放隐藏搜索及收起按钮去文字、移动队列占满内容区、iPhone 单击三点用浮层而长按用底部面板、首页配色跟随当前曲目、推荐封面与播放按钮以及空歌单主按钮的变化。本轮仅恢复桌面队列。
- **已通过。** `pnpm check`（80 Vitest、5 Worker）、最终测试修改后的 lint、Rust fmt/Clippy、26 Rust 测试（2 项默认忽略）及单独 10k 基准、19 发布脚本测试、官网构建、版本一致性及 diff 检查。
- **待验收。** Chromium 最小启动预检被 macOS Mach 服务拒绝，自动审批因缺本轮沙箱外执行授权拒绝重试。E2E、截图与桌面原生界面待验收；获授权后先复试最小启动，再跑播放队列和跨端回归。iOS 0.1.41/build 23 模拟器归档被 `simctl list runtimes` 阻塞，尚无该版本模拟器或真机验证。未执行提交、推送、CI、标签与正式发布。
- **Android 调试包已构建并校验。** 首次包装沿用 1041，随后补正为 1042。重试通过临时可写 Gradle 缓存和 Kotlin 进程内编译处理本机权限限制。有效包位于 `artifacts/android/v0.1.41-b1042/debug/`，arm64-v8a，ZIP、SHA-256 和 APK v2 调试签名校验通过，未安装或实机验证。1041 试包不作为交付产物。

## 2026-11-18 15:29（Asia/Shanghai，UTC+08:00）— Pad 恢复独立播放队列

- **UI-1118-01 已实现。** Android Pad 与 iPad 复用原有右侧抽屉，搜索与当前页面继续显示。手机仍占用播放控件上方内容区并保留底部入口。队列布局跟随现有设备标记，Android 在 599/600px 间切换时无需重新打开队列。桌面沿用上一轮恢复的侧栏；正在播放布局仍按现有设计。同步更新 [设计规范](design/DESIGN_SYSTEM.md) 和 [回归清单](development/REGRESSION_CHECKLIST.md)，AGENTS.md 现行规则继续适用。
- **验证。** `pnpm check`、Rust 格式/Clippy/测试及 10k 基准、19 项发布脚本测试、官网构建、版本一致性及 diff 检查通过。已更新 `tests/e2e/full-player-menu.spec.ts`，覆盖桌面、Android 手机/Pad 和 iPad，包含队列打开时跨宽度切换。Chromium 最小预检被 macOS Mach 服务拒绝，浏览器回归与截图未执行；待授权后重试预检。iOS 0.1.42/build 24 模拟器归档仍被 `simctl list runtimes` 阻塞。
- **Android 产物。** `artifacts/android/v0.1.42-b1043/debug/nanoPlayer-0.1.42-b1043-arm64-debug.apk`，arm64-v8a，ZIP、SHA-256 与 APK v2 调试签名校验通过。待实机安装检查手机和 Pad 的队列、搜索和退出路径。未执行提交、推送、CI、标签或正式发布。

## 2026-11-18 15:35（Asia/Shanghai，UTC+08:00）— iPhone 安装 nanoPlayer 0.1.42

- 已完成：按用户要求构建开发签名 arm64 真机归档，并原地覆盖安装到已连接的 iPhone 15 Plus。沙箱内 Xcode 查询运行时失败，沙箱外构建、安装和设备应用列表查询均成功。
- 已验证：本地应用严格签名校验通过，归档和设备均确认版本 0.1.42/build 24，应用标识 app.nanoplayer.ios。归档位于 src-tauri/gen/apple/build/nanoplayer_iOS.xcarchive。
- 本轮仅构建、验签和安装，未启动应用或执行真机功能回归，未另分配版本，未发布。

## 2026-11-18 15:38（Asia/Shanghai，UTC+08:00）— Android 手机安装 nanoPlayer 0.1.42

- 已完成：校验现有调试 APK 的 SHA-256，通过 USB 对已连接的 PKH110 手机原地覆盖安装，ADB 返回 Success。
- 已验证：设备应用信息确认 app.nanoplayer.android 为 0.1.42、versionCode 1043、arm64-v8a。安装包位于 artifacts/android/v0.1.42-b1043/debug/。
- 本轮仅安装和核对版本，未启动或执行真机功能测试，未分配新版本或发布。

## 2026-11-21 13:54（Asia/Shanghai，UTC+08:00）— 移动播放布局 0.1.43

- **UI-1121-01 已实现。** iPhone 全屏队列使用完整内容行，半屏高度上限仅适用于普通抽屉。导航按钮的触摸区域居中对齐图标。Android Pad 和 iPad 的正在播放保留左侧栏，窄 iPad 播放页使用图标侧栏。同步更新 [设计规范](design/DESIGN_SYSTEM.md) 和 [回归清单](development/REGRESSION_CHECKLIST.md)。
- **浏览器和本地门禁。** `pnpm check` 通过（Vitest 80 项）。Chromium 在沙箱内因 Mach 服务权限退出，移到沙箱外通过预检后，完整 E2E 126 通过、1 跳过（后台推理）。Rust fmt、Clippy、26 项 Rust 测试与 10k 搜索基准、19 项发布脚本测试、官网构建、版本一致性和差异检查通过。iPhone/Pad 浏览器截图见 `artifacts/ui/v0.1.43/`。
- **本地产物。** Android 0.1.43 / 1044 调试 APK 位于 `artifacts/android/v0.1.43-b1044/debug/`，arm64-v8a，ZIP 完整性和 APK v2 调试签名已校验，SHA-256 见同目录 `manifest.json`。首次构建遇到 Gradle 缓存写权限，沙箱外重试通过。iOS arm64 模拟器归档为 0.1.43 / build 25，位于 `src-tauri/gen/apple/build/nanoplayer_iOS.xcarchive`，iOS 16 目标 Clippy 与 Swift 原生单测在沙箱外重试通过。
- **发布。** 本轮未提交、推送、打标签或发布，桌面发行由用户在 main 执行 `pnpm release 0.1.43`。
- **原生回归补记。** Android 插件 JVM 任务成功，API 36 Pad 模拟器安装成功且 3 项 instrumentation 通过（`artifacts/android/tests/emulator-5560-instrumentation.txt`）。iPhone 18 Pro / iOS 27.2 的 XCUITest 通过 2 项，因模拟器资料库无预置歌曲跳过 1 项。模拟器归档为 ad hoc 签名和 iOS 16 最低目标。本轮未将应用安装到物理设备，三项布局的几何结果与截图来自浏览器，原生视觉验收仍待真机复核。
- **13:58 原生复核完成。** Android API 36 手机模拟器安装成功，3 项 instrumentation 通过（`artifacts/android/tests/emulator-5562-instrumentation.txt`）；iPad Pro 11-inch / iOS 27.2 的 XCUITest 通过 2 项、因无预置歌曲跳过 1 项。两份 iOS XCTest 结果位于 `artifacts/ios/tests/`。最终模拟器归档主可执行文件 SHA-256 为 `dce7b0fbe9957480d89233e4b92ec69d18555f98ab02be7b2c81473ca9f32a84`。短屏 iPhone 队列强制溢出的浏览器用例复测通过。

## 2026-11-21 14:00（Asia/Shanghai，UTC+08:00）— iPhone 安装 nanoPlayer 0.1.43

- 通过 `pnpm ios:build:debug` 构建 arm64 真机开发签名归档，严格验签通过。主可执行文件 SHA-256 为 `40e99ec10775fee2123112727a7a7f97dc4fc9990ab34a8aded03f096bf2eaec`。真机归档位于 `src-tauri/gen/apple/build/nanoplayer_iOS.xcarchive`，前一轮模拟器归档保存在 `artifacts/ios/v0.1.43-b25/simulator.xcarchive`。
- 通过 CoreDevice 在已连接的 iPhone 15 Plus 上原地覆盖安装。设备应用列表确认 `app.nanoplayer.ios` 为 0.1.43 / build 25。本轮完成安装与版本核对，真机启动和界面验收待验证。复用本轮版本号与构建号，未发布。
