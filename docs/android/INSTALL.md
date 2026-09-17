# Android 环境安装命令（macOS Apple Silicon）

修订 3，2026-09-16。由用户在终端执行；助手本轮未执行安装。已有 Node、pnpm、Rust 无需重装。Xcode 许可已处理。

每一步成功后再执行下一步；下载失败直接重试当前步骤。以下仅准备工具，不运行 `tauri android init/dev/build`，不开始产品开发。

## 1. 安装 JDK 与 Android 命令行工具

```sh
HOMEBREW_NO_AUTO_UPDATE=1 brew install openjdk@21
HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask android-commandlinetools
```

关闭自动更新仅跳过 Homebrew 自身更新，不会绕过软件索引/包下载。若仍停在下载，请检查终端网络能否访问 Homebrew 和 Google 下载站点，不必反复启动并行安装。

## 2. 配置当前终端并安装 SDK / NDK

请在同一个终端依次执行：

```sh
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.2.12479018"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
mkdir -p "$ANDROID_HOME"
java -version

"$(brew --prefix)/bin/sdkmanager" --sdk_root="$ANDROID_HOME" --licenses
"$(brew --prefix)/bin/sdkmanager" --sdk_root="$ANDROID_HOME" \
  "cmdline-tools;latest" \
  "platform-tools" \
  "platforms;android-36" \
  "build-tools;36.0.0" \
  "ndk;27.2.12479018"
```

许可提示请阅读后按提示接受，不使用自动 yes。Homebrew 安装的工具默认 SDK 根与本项目选择的目录可能不同，因此第一次显式使用 `--sdk_root`；安装 `cmdline-tools;latest` 到该根后，诊断脚本即可检查一致的路径。

API 36、Build Tools 36.0.0 与 NDK 27.2 是当前计划的候选工具组合。正式开发获批后需与 Tauri 生成工程的 Gradle/NDK 配置核对；安装成功不等于已通过 Android 编译验证。JDK 由 JAVA_HOME 使用，无需 sudo 创建系统 Java 符号链接。

## 3. 安装 Rust Android 目标

```sh
rustup target add aarch64-linux-android x86_64-linux-android
```

arm64 真机和本机 Apple Silicon 模拟器使用 aarch64；x86_64 用于其他模拟器/CI。中断后可重跑，已安装目标会跳过。

## 4. 安装模拟器（建议安装）

```sh
sdkmanager --sdk_root="$ANDROID_HOME" \
  "emulator" \
  "system-images;android-36;google_apis;arm64-v8a"
```

手机与 Pad 可共用这个系统镜像。AVD 设备定义待工具安装完成后用 `avdmanager list device` 核对实际可用设备再创建，避免把不存在的设备 ID 写死。模拟器安装不代表已完成 AVD 或真机验收。

Android Studio 是可选的图形 IDE（包含 Device Manager），需要时安装：

```sh
HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask android-studio
```

打开后将 SDK 路径设为 `$HOME/Library/Android/sdk`，避免另装一份 SDK。

## 5. 核验

```sh
java -version
sdkmanager --sdk_root="$ANDROID_HOME" --list_installed
adb version
rustup target list --installed
cd '/Users/maweifeng/Documents/项目/nanoPlayer'
pnpm android:doctor
```

预期 doctor 不再报告 MISSING。它只检查工具存在，不验证全部版本兼容、模拟器启动、Android 编译或真机播放。把安装错误或最后的检查输出发给助手即可继续核验。

## 6. 新终端如何保持环境

上面的 export 只对当前终端有效。可把下面四行加入 `~/.zprofile` 一次，或在每次开发终端手动运行；不要反复追加：

```sh
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.2.12479018"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

配置后新开终端再运行 `java -version` 和 `pnpm android:doctor`。无需单独安装全局 Gradle：开发批准后使用生成工程自己的 Gradle wrapper。

## 核查依据

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Android sdkmanager：安装、许可与 sdk_root](https://developer.android.com/tools/sdkmanager)
- [Homebrew Android command-line tools](https://formulae.brew.sh/cask/android-commandlinetools)
- [Homebrew JDK 21](https://formulae.brew.sh/formula/openjdk@21)
