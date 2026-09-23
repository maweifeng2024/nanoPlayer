# Repository and client structure

## Goal

nanoPlayer uses one shared product core with explicit client integration boundaries. “Consistent clients” means the same lifecycle vocabulary, version source, verification standard, and documentation shape—not duplicated source trees.

## Current layout

```text
.
├── src/                       shared React UI, state, and platform adapters
├── src-tauri/
│   ├── src/                   shared Rust core plus desktop/mobile entry boundaries
│   ├── plugins/               native capability plugins
│   ├── gen/                   generated native projects kept only where reproducible
│   └── migrations/            ordered shared database migrations
├── tests/                     shared browser tests and redistributable fixtures
├── website/                   product and download website
├── packaging/
│   ├── android/               Android version/signing/package contract
│   ├── macos/                 macOS packaging metadata
│   ├── windows/               Windows packaging notes
│   └── linux/                 Linux packaging notes
├── scripts/
│   ├── android/               Android environment/build/device helpers
│   ├── design/                design-system checks
│   └── release/               shared release dispatcher and verification
└── docs/
    ├── product/               product baseline
    ├── architecture/          shared implemented architecture
    ├── clients/               current per-client documents
    ├── development/           setup and command reference
    ├── release/               version/distribution contract
    ├── design/                current design system and baselines
    └── archive/               dated or superseded records
```

The existing source locations remain unchanged in this documentation-only refactor. Moving them would change imports, generated project paths, test discovery, and release inputs, so that work requires its own implementation change and release.

## Adding iOS without duplicating the product

When iOS development begins, extend the existing boundaries in this order:

1. Add iOS capability adapters under `src/platform/` only where browser/Tauri behavior differs.
2. Add native integration through the Tauri Apple project/plugin boundary under `src-tauri/`; do not fork the React feature tree or Rust domain/database rules.
3. Add `scripts/ios/` for doctor, simulator/device build, and test helpers.
4. Add `packaging/ios/` for the tracked build-number authority, entitlements/profile documentation, export settings, and signing contract. Secrets remain external.
5. Add iOS fixtures/device tests alongside existing shared tests, using only redistributable media.
6. Replace the planning-only iOS README with current architecture, setup, status, and release evidence.
7. Register root commands using the lifecycle contract in `AGENTS.md`, then extend the release dispatcher only when artifact verification is implemented.

## Public command shape

Root package scripts are the only documented public command surface. A client may omit a stage while unsupported, but must not use a different name for the same lifecycle.

| Lifecycle | Desktop | Android | iOS |
| --- | --- | --- | --- |
| Diagnose | shared setup checks | `android:doctor` | planned `ios:doctor` |
| Develop | `tauri dev` | Tauri/native helper commands | planned simulator/device helper |
| Build | `tauri build` | `android:build:debug` | planned `ios:build:<variant>` |
| Test | shared Vitest/E2E/Rust | `android:test:emulator` | planned `ios:test:simulator` |
| Package/release | `release:desktop` / `release` | `release:android` | planned `release:ios` |

Planned names are a contract for future implementation, not runnable commands today.

## Organization rules

- Keep shared behavior in shared modules until a real platform capability requires an adapter.
- Keep native generated projects reproducible and free of build output, signing data, and machine-specific paths.
- Use the same client name across scripts, packaging, documentation, tests, and artifact directories.
- Every current client document distinguishes implementation, verification, and remaining acceptance.
- Archive dated work after its conclusions are incorporated into a current source of truth.
