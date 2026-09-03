# macOS packaging

The first release target is macOS 12+ as a signed and notarized universal DMG. Keep signing identities, App Store Connect keys, and notarization credentials outside the repository.

The current development gate is:

```bash
pnpm tauri build --debug --bundles app
plutil -extract CFBundleIconFile raw src-tauri/target/debug/bundle/macos/nanoPlayer.app/Contents/Info.plist
test -s src-tauri/target/debug/bundle/macos/nanoPlayer.app/Contents/Resources/icon.icns
```

Open the generated app and verify restored-but-paused playback, readable dates, native menus, the title-bar traffic-light safe area, the configured application icon, and dark/light appearance. A successful debug build is not release qualification.

For release, build Apple Silicon and Intel artifacts on macOS, verify the redistributable format matrix, media keys, output-device changes, sleep/wake, gapless behavior, VoiceOver, 200% scale, and the eight-hour soak. Then sign, notarize, create the DMG, and run `spctl --assess` plus `xcrun stapler validate` on the final app and DMG.
