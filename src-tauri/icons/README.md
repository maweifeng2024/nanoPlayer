# Application icons

The source of truth is `../../docs/design/nanoplayer-app-icon-v2.png`. Files in this directory are generated outputs and must not be used as the next generation source.

Generate all platform assets from the source artwork:

```bash
pnpm tauri icon docs/design/nanoplayer-app-icon-v2.png
```

`src-tauri/tauri.conf.json` must explicitly list the PNG, ICNS, and ICO assets under `bundle.icon`. For a macOS bundle, verify the final result rather than only checking the source files:

```bash
plutil -extract CFBundleIconFile raw src-tauri/target/debug/bundle/macos/nanoPlayer.app/Contents/Info.plist
test -s src-tauri/target/debug/bundle/macos/nanoPlayer.app/Contents/Resources/icon.icns
```

The first command must print `icon.icns`. Finder/Dock inspection on a clean release machine remains part of release qualification.
