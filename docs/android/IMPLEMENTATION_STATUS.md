# Android implementation status

Updated 2026-09-17. User approved full phone/Pad development and P1–P5. Development is continuing; this is not a production-release acceptance certificate.

## Implemented

- Independent Android entry point/application ID `app.nanoplayer.android`, API 29 minimum; shared Rust database and library/lyrics/metadata/backup commands. Desktop audio/window/menu/updater initialization stays in `desktop.rs`.
- SAF read-only persistent tree grants, metadata and same-directory LRC scanning, cancellation, permission diagnostics, private embedded-artwork cache, system-picker lyric/playlist-cover imports.
- Additive URI resource migration: tree/document/content URI identities, stable Android track ID allocation, rescan retains track IDs, ratings and playlist associations.
- Media3 foreground service owns queue, playback, focus, headset disconnect handling and durable SQLite session journal. Activity/WebView destruction does not stop a playing queue. Process restoration does not autoplay.
- Frontend native adapter serializes commands and applies native snapshots without feedback. Library refresh cannot replace the service queue. Rust merges session events by unique session ID; acknowledgements check the exact listened/count values. UI preference saves cannot overwrite native counts.
- Shared desktop visuals and components. Phone has home/library/playlists navigation, library tabs and compact player; Pad keeps desktop menu names/order, with <900px sidebar overlay, scrollable wide tables, touch sizes and long-press More menu.
- Android safe-area/keyboard insets, system Back handling, native document selection and system sound settings; desktop updater and window dragging excluded.
- Android packaging entry supports local debug/signed-release APK, separate versionCode, signature verification, SHA-256 and local manifest. It does not tag, upload, or change desktop update metadata.

## Verified so far

- Frontend lint/typecheck/build and 34 Vitest tests passed, including native snapshot/no feedback, queue edit, rescan and disposal cases.
- Browser regression: 29 passed, including phone navigation and Pad windows at 840/600/360 CSS px. The Pad test preserves desktop menu order after resizing; it does not establish Android OS split-screen acceptance.
- Rust: 16 passed, 2 intentionally ignored (network/benchmark). URI rescan/permission recovery and event deduplication included. Full latest integration checks are rerun after changes.
- Native ListeningSession: 3 JVM tests passed (natural completion once, pause/seek exclusion, restored-count deduplication).
- API 36 arm64 phone emulator: 3 instrumentation tests passed. Two generated WAV items complete and count once after Activity/WebView destruction; SHA-256 unchanged. Stale acknowledgements cannot discard newer progress; journal v1 upgrades to v4 preserving queue, pending counts and acknowledgement persistence. New sessions export their original start time.
- Rust null-timestamp regression passed: an existing rating row with no last-played time now receives the native session timestamp. Clippy with warnings denied passed. Release-script tests: 14 passed.
- Phone system SAF picker: selected a generated WAV/LRC fixture folder, imported one track, played naturally and counted once. Device/source SHA-256 both `d303811b8c84619667cd0501342f84ec6cbe69f7aa3856dcf52fabda374c92b8`.
- Phone and Pixel Tablet API 36 emulators installed the same APK. Actual WebView device classification is phone (412px) / Pad (1280px). Pad full-width side-menu order visually checked.
- Latest Pad portrait check: actual emulator rotation produces an 800×1224 CSS px WebView classified as Pad. The 48×48 navigation button responds to native touch and opens the original desktop menu; phone navigation remains hidden. Fixed both the desktop `!important` visibility override and the stale second grid column at 760–900px. Local screenshots: `artifacts/android/evidence/pad-portrait.png` and `pad-navigation.png`.
- Debug APK builds succeeded. Subsequent changes require rebuilding/reinstalling; build output alone is not device acceptance.

## Remaining acceptance and work

- Complete Android OS split-screen, back/overlay order (including onboarding), touch targets and large-font acceptance. Browser narrow-window and emulator portrait evidence above covers only those cases. Long-press and movement cancellation have earlier emulator evidence; broaden coverage to all list contexts.
- Complete phone details/queue usability, error/permission edge cases, pending native event recovery, backup/restore and upgrade persistence validation.
- Format matrix (beyond PCM WAV), damaged files, cloud/non-seek providers and bounded fallback cache remain unverified/incomplete.
- API 29/33, 60-minute background/lockscreen, Bluetooth/headset/audio interruptions, 10k-track performance and manufacturer battery behavior need device evidence.
- No physical phone or Pad has been connected in the recorded runs. No production keystore has been supplied; only debug signing is verified. Signed release, store/AAB and public publication remain unaccepted.

## Reproduction

```sh
source scripts/android/env.sh
pnpm android:doctor
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml
pnpm android:build:debug
pnpm android:test:emulator -- emulator-5554
pnpm release:android -- --dry-run
pnpm release:android -- --debug
```

Native tests live in `src-tauri/plugins/nanoplayer-mobile/android/src/test/` and `src-tauri/gen/android/app/src/androidTest/`. Do not use personal music as fixtures. APKs under `artifacts/android/` are local build outputs and are excluded from Git.

## Current local package

- `artifacts/android/v0.1.7-b1008/debug/nanoPlayer-0.1.7-b1008-arm64-debug.apk`
- SHA-256: `26475ddab60c0c58f15f83117166e832c71f545cb8dac9d7eed0eaf6708c8685`
- Debug arm64 APK, 393,603,936 bytes; contains unstripped Rust debug symbols because Gradle could not strip the library. This is a development build, not the production size or release-signing result.
- Companion `manifest.json`, `SHA256SUMS` and `signing-verification.txt` were generated by the packaging script. No public upload occurred.
