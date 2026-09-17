# Android 本地开发环境核查

核查日期：2026-09-16；主机 macOS / Apple Silicon。当前尚不具备完整 Android 编译环境，未初始化移动工程。

| 项目 | 实测结果 |
| --- | --- |
| Node / pnpm | v26.7.0 / 11.24.0 |
| Rust | rustc 1.98.0；原有目标 aarch64-apple-darwin |
| Java | /usr/bin/java 为系统入口，运行提示没有 Java Runtime；JDK 21 待安装 |
| Android Studio | /Applications 中未发现；可选 IDE，命令行链路优先 |
| Android SDK / adb / sdkmanager | 未发现默认 SDK 目录及 PATH 工具 |
| NDK / emulator | 未安装 |
| 可用磁盘 | 约 1.2 TiB |
| 当前安装阻塞 | Xcode 许可已处理，首次启动检查通过；Homebrew 自动更新/API 下载停滞，JDK/SDK 尚未安装成功 |

已尝试 `brew install --cask android-commandlinetools`、`brew install openjdk@21`，均在安装前退出。用户随后确认已运行 `sudo xcodebuild -license`；本轮 `xcodebuild -checkFirstLaunchStatus` 返回 0。未代替用户接受协议，未修改全局 shell 配置。

## 后续安装顺序

1. Xcode license 阻塞已解除；继续安装 JDK 21 和 Android command-line tools；确认 Homebrew 实际安装路径。
2. 以 `~/Library/Android/sdk` 为 SDK 根；安装 platform-tools、候选 `platforms;android-36`、`build-tools;36.0.0`、`ndk;27.2.12479018`。SDK/NDK 候选版本需在 A 阶段与 Tauri 生成的 Gradle 配置确认，不能当作已验证兼容组合。
3. 用 sdkmanager 交互阅读/接受所需 SDK 许可。配置 JAVA_HOME、ANDROID_HOME、NDK_HOME 与 PATH；仅在实际路径确定后提供环境文件，不提交本机路径或密钥。
4. Rust 目标 `aarch64-linux-android`（arm64 真机）和 `x86_64-linux-android`（x86_64 模拟器/CI）安装核验。Apple Silicon 本机模拟器使用 arm64-v8a 系统镜像，对应 aarch64 目标。
5. 安装 emulator 与 arm64 系统镜像，建立手机和 Pad AVD；物理设备另启用 USB 调试并由用户确认连接。模拟器不替代后台/省电/蓝牙真机验收。
6. `pnpm android:doctor` 重跑。该命令只检查工具存在，不启动 adb 服务、不安装、不接受许可、不编译产品。工具全部存在也不意味着移动应用已能编译。

尚未下载 Gradle 项目依赖或 Media3，未生成签名密钥，未运行 `tauri android init/dev/build`；这些属于确认后的开发阶段。

## 本轮验证

- `node --test scripts/release/*.test.mjs`：13/13 通过（网站测试用本机临时 HTTP 服务，无真实发布）。
- `node scripts/release/check-version.mjs`：0.1.7 一致，未升级产品版本。
- `git diff --check`：通过。
- `pnpm android:doctor`：按预期返回非零并逐项列出缺失环境。
- HTML 是静态评审线框；未将它作为 Android UI 或真机验证证据。

Rust Android 目标安装已启动（`rustup target add aarch64-linux-android x86_64-linux-android`）；截至本轮最后检查仍在下载，`rustup target list --installed` 尚只列出宿主目标。因此不能标为安装成功；后续需再次核验该命令结果。该记录为当时状态，当前未确认安装完成。

## 修订 2 环境补查

用户已处理 Xcode 许可。重新尝试 Homebrew 安装及跳过自动更新的重试，均停留在自动更新/API 下载阶段；为避免重复安装请求，已停止本轮停滞进程。没有把依赖标为安装完成。Rust 当前复查仍只列出宿主目标，Android 目标需要重新安装验证。环境准备待下载恢复后处理，不影响本轮设计修订交付。

## 修订 3：交由用户安装

按用户要求，后续安装由用户在终端执行，本轮未再次执行安装或修改 shell 配置。完整分步命令见 [INSTALL.md](INSTALL.md)，包含 JDK、SDK/NDK、Rust Android 目标、模拟器及核验。等待用户安装输出后更新环境结论；不将设计批准或命令提供视为安装成功。
