# macOS packaging

2026-09-11：v0.1.7 已发布 universal DMG 与 app archive；当前未完成 Developer ID 签名和 Apple 公证。下述签名/真机检查为资格要求，不是已完成记录。

The declared macOS target is 12+; the published universal DMG is unsigned and not notarized. Keep signing identities, App Store Connect keys, and notarization credentials outside the repository.

The current development gate is:

```bash
pnpm tauri build --debug --bundles app
plutil -extract CFBundleIconFile raw src-tauri/target/debug/bundle/macos/nanoPlayer.app/Contents/Info.plist
test -s src-tauri/target/debug/bundle/macos/nanoPlayer.app/Contents/Resources/icon.icns
```

Open the generated app and verify restored-but-paused playback, readable dates, native menus, the title-bar traffic-light safe area, the configured application icon, and dark/light appearance. A successful debug build is not release qualification.

For release, build Apple Silicon and Intel artifacts on macOS, verify the redistributable format matrix, media keys, output-device changes, sleep/wake, gapless behavior, VoiceOver, 200% scale, and the eight-hour soak. Then sign, notarize, create the DMG, and run `spctl --assess` plus `xcrun stapler validate` on the final app and DMG.
