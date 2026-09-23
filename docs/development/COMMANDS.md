# nanoPlayer 命令速查：推送、构建与发布

核对日期：2026-09-22。以当前根目录 `package.json`、`scripts/release/`、`scripts/android/` 和 `.github/workflows/` 的实际实现为准；iOS 尚无可运行命令。

## 1. 先选对命令

| 目标 | 命令 | 提交/推送源码 | 产物与发布行为 |
| --- | --- | --- | --- |
| 新建桌面版本并发布 | `pnpm release` | 是，正常新版本流程提交全部未被 Git 忽略的改动，推送 main 和版本标签 | GitHub 构建 macOS、Windows、Linux，发布 Release 并部署官网 |
| 恢复已有桌面发布 | `pnpm release --resume [版本标签]` | 仅补推中断的已有提交/标签，不自动提交新改动 | 等待已有流程，或复用产物恢复发布/官网部署 |
| 本地构建桌面安装包 | `pnpm tauri build` | 否 | 构建当前平台的桌面应用包，不发布 |
| 本地构建安卓正式 APK | `pnpm release:android` | 否 | 构建、验证签名并归档 ARM64 APK，不上传 |
| 本地构建并归档安卓测试 APK | `pnpm release:android --debug` | 否 | 运行检查、构建并归档 debug APK，不上传 |
| 快速构建安卓测试 APK | `pnpm android:build:debug` | 否 | 环境检查后构建 debug APK，不执行完整质量检查/归档 |
| 只构建前端 | `pnpm build` | 否 | TypeScript 检查和 Vite 构建，输出 `dist/`，不生成安装包 |
| 只构建官网 | `pnpm website:build` | 否 | 调用官网 build 脚本，不部署 |
| 只推送代码 | 没有专用 pnpm 命令，使用 Git，见第 5 节 | 是 | 不创建发布标签，不触发标签发布流程 |

**安卓源码可以随 `pnpm release` 一起提交，但这不代表安卓 APK 会被构建或发布。当前 GitHub 发布工作流只有三个桌面平台。**

## 2. 桌面发布命令与参数

```bash
pnpm release
pnpm release 0.2.0
pnpm release --resume v0.2.0
pnpm release:desktop
pnpm release --platform desktop
```

示例版本号应替换为实际目标版本。`release:desktop` 和 `--platform desktop` 都显式选择桌面流程，默认 `release` 也是桌面流程。

| 参数 | 示例 | 功能与限制 |
| --- | --- | --- |
| 无参数 | `pnpm release` | 正常新版本流程基于 HEAD 中 package.json 的版本，将补丁号加 1；如果已有未完成发布，会要求恢复，而非静默跳到下一版 |
| 版本号 | `pnpm release 0.2.0` | 显式指定版本；支持 `0.2.0` 或 `v0.2.0`，仅支持稳定的三段版本号 |
| `--resume [版本标签]` | `pnpm release --resume v0.2.0` | 恢复指定版本，不递增版本；省略标签时使用当前项目版本，建议明确指定 |
| `--skip-checks` | `pnpm release 0.2.0 --skip-checks` | 跳过本地发布测试、前端/Rust 检查和官网构建；仍会同步/校验版本并提交、打标签、推送，远端 CI 检查仍执行；仅用于排查流程 |
| `--platform desktop` | `pnpm release --platform desktop 0.2.0` | 显式选择桌面流程，也支持 `--platform=desktop` |
| `--` | `pnpm release -- 0.2.0` | 参数分隔符，发布分流脚本会忽略它 |

`--resume` 不能与 `--skip-checks` 同用。未知参数、重复的平台参数和预发布版本（如 `0.2.0-beta.1`）会被拒绝。桌面流程没有 `--dry-run`，不要用普通 `pnpm release` 预览操作。

### 正常新版本流程

1. 要求当前分支为 `main`、origin 指向 GitHub，且 Git 与 `gh` 已认证。
2. 获取远端 main 和标签；本地落后时尝试 `pull --rebase --autostash`。
3. 确定版本，同步 package.json、Tauri、Cargo、官网版本及 CHANGELOG。
4. 运行发布脚本测试、`pnpm check`、端到端测试、Rust fmt/clippy/test、搜索基准测试和官网构建。
5. 执行 `git add --all`，提交改动，创建 `vX.Y.Z` 标签，原子推送 main 与该标签。
6. 等待 GitHub Actions 构建桌面三平台、发布安装包/校验和/更新清单、部署官网并校验。

提交范围包括新增、修改、删除的文件和安卓源码；忽略的未跟踪文件（如构建目录、密钥）不包含在内。只推送 main 和目标标签，不会推送所有分支。需要提前配置远端签名、更新器及官网部署凭据，详见 [发布流程](../release/RELEASE_PROCESS.md)。

### `--resume` 的恢复边界

- 本地已有标签但远端缺失：工作区干净、标签属于 main 且分支未分叉时，补推 main 和原标签。
- 原构建或恢复流程仍运行：等待该流程完成。
- 原构建已结束：使用 main 上的发布工作流，复用该标签的原构建产物；不会自动重新编译应用。
- 已有恢复流程成功发布产物、但官网步骤失败：复用已发布产物恢复官网，避免重复上传。
- 对应恢复流程已成功：直接结束。
- 未提交改动或未推送提交通常会阻止远端恢复；发布脚本修复需先提交并推送。
- 原构建失败、三平台产物不完整或产物过期时，恢复发布的校验会失败；`--resume` 不能代替重新运行失败的构建。

不要通过移动已有标签来把新代码混入旧版本。

## 3. 安卓构建命令与参数

```bash
# 查看构建计划：不构建、不签名、不推送
pnpm release:android --dry-run

# 本地正式 APK：需已配置签名环境变量
pnpm release:android

# 本地测试 APK：不需要正式签名配置
pnpm release:android --debug

# 等效的平台选择写法
pnpm release --platform android --debug

# 快速 debug 构建，不归档到 artifacts
pnpm android:build:debug
```

| 参数 | 功能与限制 |
| --- | --- |
| 无参数 | 构建 release APK，要求四项签名环境变量齐全且密钥库存在 |
| `--debug` | 改为 debug APK，使用测试签名 |
| `--dry-run` | 输出版本、versionCode、命令、目录及签名要求，不执行构建；可与 `--debug` 同用 |
| `--build-only` | 当前被接受，但没有额外分支行为；安卓入口本来就只本地打包，不发布 |
| `--platform android` | 通过通用 release 入口选择安卓，也支持 `--platform=android`；`release:android` 已固定平台，无需重复传入 |

安卓入口不支持版本号参数、`--resume` 或 `--skip-checks`。它不会自动递增版本、创建标签、推送源码、上传 GitHub Release 或修改桌面更新清单。

### 环境、签名与输出

- 版本名读取根目录 `package.json`；独立 versionCode 读取 `packaging/android/version-code.json`，需自行维护递增。
- 当前固定构建 `aarch64` / `arm64-v8a` APK，最低 Android 10（API 29）；该入口不生成 AAB。
- 环境使用 `JAVA_HOME`、`ANDROID_HOME`、`NDK_HOME`，默认路径按本机 macOS/Homebrew 布局设置；其他环境应显式设置这些变量。
- 当前检查涉及 JDK、Android SDK 36、Build Tools 36.0.0、NDK 27.2.12479018，以及 Rust 的 aarch64/x86_64 Android targets。`android:doctor` 仅检查工具存在和命令可运行，不等于构建验证通过。

正式签名所需变量：

| 环境变量 | 内容 |
| --- | --- |
| `NANOPLAYER_ANDROID_KEYSTORE` | 密钥库路径，建议使用绝对路径 |
| `NANOPLAYER_ANDROID_KEY_ALIAS` | 签名密钥别名 |
| `NANOPLAYER_ANDROID_STORE_PASSWORD` | 密钥库密码 |
| `NANOPLAYER_ANDROID_KEY_PASSWORD` | 密钥密码 |

`release:android` 会执行环境检查、`pnpm check`、Rust 测试、Tauri Android 构建及 `apksigner` 验证，再将结果写入：

```text
artifacts/android/v<version>-b<versionCode>/<release或debug>/
  nanoPlayer-<version>-b<versionCode>-arm64-<release或debug>.apk
  SHA256SUMS
  signing-verification.txt
  manifest.json
```

`android:build:debug` 的原始输出位于：

```text
src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

## 4. 开发、构建和检查命令

以下命令不会提交或推送源码，也不会发布 GitHub Release。

| 命令 | 功能 / 参数 |
| --- | --- |
| `pnpm install` | 安装前端与 Tauri 工具依赖；`--frozen-lockfile` 要求锁文件与依赖声明一致 |
| `pnpm dev` | 启动 Vite 前端开发服务 |
| `pnpm tauri dev` | 启动本地桌面开发应用 |
| `pnpm build` | TypeScript 检查及前端生产构建 |
| `pnpm preview` | 预览已构建的前端 |
| `pnpm tauri build` | 本地桌面 release 构建；常规安装包位于 `src-tauri/target/release/bundle/` |
| `pnpm tauri build --target universal-apple-darwin` | macOS 通用构建；需在 macOS 配齐双架构 Rust 工具链，输出位于对应 target 子目录 |
| `pnpm website:dev` | 启动官网开发服务 |
| `pnpm website:build` | 构建官网；等效于 `npm run build --prefix website` |
| `pnpm check` | 依次执行 lint、前端单元测试、前端构建；不含 Rust、E2E 和官网构建 |
| `pnpm lint` | 检查 src、tests 中的前端代码 |
| `pnpm format` | 格式化 src、tests，直接修改文件 |
| `pnpm test` | 执行 Vitest 单元测试 |
| `pnpm test:watch` | 启动 Vitest 监听模式 |
| `pnpm test:e2e` | 执行项目端到端测试脚本 |
| `pnpm android:doctor` | 只读检查安卓工具环境，不安装工具、不启动 adb、不初始化项目 |
| `pnpm android:test:emulator [序列号]` | 默认 `emulator-5554`；重新构建并安装 debug/测试 APK，运行原生测试；仅接受 `emulator-数字`，报告位于 `artifacts/android/tests/` |

模拟器测试示例：

```bash
pnpm android:test:emulator emulator-5556
```

`pnpm tauri` 是 Tauri CLI 的透传入口，完整 CLI 参数可查看 `pnpm tauri build --help` 或 `pnpm tauri android build --help`；不要把 Tauri CLI 参数直接传给项目自定义的 `release` 脚本。

## 5. 只推送代码，不发布版本

项目没有 `pnpm push` 或仅推送源码的 release 参数。若只同步代码到 GitHub，在 main 分支检查并提交需要的改动后执行：

```bash
git status --short
git diff
git add --all
git diff --cached --stat
git commit -m "feat(android): update Android implementation"
git push origin main
```

提交信息应按实际改动调整。这里不创建版本标签，因此不会触发 `release.yml` 的标签发布流程；其他 CI 仍可能运行。若要发布新桌面版本，直接使用 `pnpm release` 的自动提交流程即可，无需重复手工提交。

## 6. 当前能力边界与依据

- 已实现：桌面三平台 GitHub 发布及恢复；安卓源码随 Git 提交；本地安卓 APK 构建、签名验证和产物归档。
- 尚未接入：Android GitHub Actions 构建、APK 自动上传发布、安卓发布恢复流程。
- 旧版文档中“安卓入口直接失败、尚未启用安卓代码”的描述已落后于当前本地实现；本速查表按实际脚本核对，不代表这些本地改动已推送到远端。

实现来源：

- [命令注册](../../package.json)
- [平台分流与参数](../../scripts/release/platform-options.mjs)
- [桌面发布](../../scripts/release/release.mjs)、[桌面参数](../../scripts/release/release-options.mjs)
- [推送恢复](../../scripts/release/recover-push.mjs)、[发布恢复](../../scripts/release/resume-release.mjs)
- [安卓打包](../../scripts/release/android.mjs)、[安卓工具脚本](../../scripts/android/)
- [桌面构建工作流](../../.github/workflows/release.yml)、[发布与官网工作流](../../.github/workflows/publish-release.yml)
