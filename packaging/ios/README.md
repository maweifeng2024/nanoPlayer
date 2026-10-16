# iOS 本地打包契约

共享 versionName 取 root package.json。`build-number.json` 独立维护 `buildNumber` 与本次 `version`；当前 0.1.26 / 10。每个新预期安装构建递增一次，失败重试复用该次编号。改变共享版本时先同步版本，然后在此分配新的 build number；`ios:dev`/构建入口会拒绝未分配的版本。

`pnpm release:ios -- --simulator --debug` 创建本地 arm64 模拟器 app ZIP。`pnpm release:ios -- --device --debug` 使用 Xcode development Team/profile 导出本地真机调试 IPA；非 debug 可通过 `--export-method release-testing` 或 `app-store-connect` 指定导出契约。这些命令执行本地门禁并核验身份、版本/build、架构、产物新鲜度、签名和 SHA-256，不上传、不创建标签、不更新网站或桌面 updater。`--dry-run` 仅展示计划。

默认无开发者 Team/证书时，不应执行真机签名导出。Team 通过 `APPLE_DEVELOPMENT_TEAM` 环境变量或 Xcode 工程提供；工程重生成前保存在忽略的 `.ios-local/`，不提交到仓库；生产签名需用户明确授权。本机开发签名 IPA 导出、签名、版本与架构验证已通过；生产分发仍未执行。

本地版本目录为 `artifacts/ios/v<version>-b<buildNumber>/<kind>/`，包括产物、SHA256SUMS、签名证据和 manifest。已有 manifest 的构建禁止覆盖。模拟器 ZIP 不可装在真机；签名 IPA 也只表示打包验证，真机安装/升级和发布分别验收。

完整流程与当前阻塞见 [iOS 流程](../../docs/clients/ios/WORKFLOW.md) 和 [状态](../../docs/clients/ios/STATUS.md)。
