# Development setup

## Common prerequisites

Install Node.js 22+, pnpm 11+, and stable Rust with `clippy` and `rustfmt`. Then install dependencies with `pnpm install`.

## Platform prerequisites

- macOS: Xcode Command Line Tools. Signing and notarization require an Apple Developer identity only for release builds.
- Windows: Microsoft C++ Build Tools and WebView2. WiX is required when producing MSI packages.
- Linux: WebKitGTK, build essentials, ALSA development headers, and the distribution-specific Tauri prerequisites.

## Daily workflow

```bash
pnpm tauri dev
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test:e2e
npm run build --prefix website
```

Use only redistributable fixtures under `tests/fixtures/`. Before merging filesystem work, compare fixture hashes before and after the test to prove source files remained unchanged.

## Native debug bundle

```bash
pnpm tauri build --debug --bundles app
```

On macOS the bundle is written to `src-tauri/target/debug/bundle/macos/nanoPlayer.app`. After changing icons, title-bar layout, migrations, IPC commands, or native menus, open this bundle and inspect the real application; a browser build is not sufficient evidence.

Browser runs intentionally use demo tracks. Tauri runs load the application database and may start a read-only differential scan of previously approved roots.

## Icon generation

The editable source of truth is `docs/design/nanoplayer-app-icon-v1.png`. Regenerate platform assets with:

```bash
pnpm tauri icon docs/design/nanoplayer-app-icon-v1.png
```

Do not use a generated `src-tauri/icons/icon.png` as the next generation source. Verify `bundle.icon` in `src-tauri/tauri.conf.json` and inspect the final application bundle as described in `src-tauri/icons/README.md`.
