# Android implementation status

Updated 2026-10-13; local source version 0.1.18. User approved full phone/Pad development and P1–P5. Development is continuing; this is not a production-release acceptance certificate.

## 2026-10-13 device-confirmed Android ANR repair (0.1.18)

- Cause verified on USB-connected PKH110 / Android 16: 0.1.17 main thread stalled in `MediaController.moveMediaItem` while reconciling a large queue. Frontend indexing alone did not solve the native ANR.
- Implemented: at most two batch replacements around the current source; background queue parsing and permission validation. Current item/position stay intact when still selected.
- Verified: 13 native tests, 56 frontend unit tests, 77 browser tests, Rust fmt/Clippy/tests/FTS benchmark, website build. Local evidence: `artifacts/verification/v0.1.18/summary.md`.
- Phone: 0.1.18 / 1016 installed in place; nine toggles each starting with a 3,284-item queue plus Android touch-input checks passed; no new ANR through 18:54:47 CST. Selection and paused queue/position restored. Long-duration/lockscreen acceptance remains open.
- APK: `artifacts/android/v0.1.18-b1016/debug/nanoPlayer-0.1.18-b1016-arm64-debug.apk`, arm64-v8a, APK v2 debug signature verified. Desktop publication remains user-run: `pnpm release 0.1.18` from main.

## 2026-10-13 artist artwork and library selection (0.1.17)

- Implemented: full-name artist fallback with a local music illustration; cached root selection membership; library/settings pages skip unused collection filtering. Android queue synchronization now indexes tracks instead of repeatedly scanning the library.
- Verified: 56 unit tests, 77 browser tests, Rust fmt/Clippy/tests, explicit 10,000-track FTS benchmark and source-byte preservation fixture; cover screenshot visually inspected. Local evidence: `artifacts/verification/v0.1.17/summary.md`.
- Android test artifact: `artifacts/android/v0.1.17-b1015/debug/nanoPlayer-0.1.17-b1015-arm64-debug.apk`, arm64-v8a, APK v2 debug signature verified. No device connected; real-library responsiveness and installation remain acceptance work. Desktop publication is user-run with `pnpm release 0.1.17` from main.

## 2026-10-13 release repair (0.1.16)

- Remove unnecessary closure borrows rejected by desktop CI Clippy; lyric error messages and lookup behavior are unchanged.
- Verified local debug APK: `artifacts/android/v0.1.16-b1014/debug/nanoPlayer-0.1.16-b1014-arm64-debug.apk`; versionName 0.1.16, versionCode 1014, arm64-v8a, minSdk 29, 209134714 bytes, APK v2 Android Debug signing. SHA-256: `edac2552eb18b2004d56887e47582cdbee7e7bb32fc3c616ab796dd3d2fe1f86`. No device is connected; installation/launch remains unverified. See `artifacts/verification/v0.1.16/summary.md` for local checks.


## 2026-10-13 local implementation (0.1.15)

- Shared UI: 12px auxiliary text, 44px medium controls and Android minimum touch targets; all shared song-list rows reserve an artwork-safe playback-accent gutter.
- Shared lyrics: memoized plain/enhanced LRC parsing, progressive word fill, synchronized multiline display, persistent 16–40px font size and per-song ±10-second correction. The drawer and expanded player share word rendering. Online lookup remains opt-in LRCLIB; macOS system overlays, translation generation and additional providers are not implemented by this change.
- Upgrade safety: transactional SQLite schema migration/adoption (user_version 6), failed-upgrade rollback and newer-schema rejection; frontend/native preference schema 4 defaults, numeric/shape validation, future-version guard and immediate write-back.
- Verified locally: 54 Vitest tests, 76 browser E2E tests (including visual baselines at desktop/phone/Pad sizes), Rust format/clippy, 18 Rust tests plus the explicit 10,000-row FTS benchmark, source-byte preservation test, 15 release-script tests and website build pass. Android plugin compilation and all 10 native unit tests pass (five cover sleep timing).
- Android sleep timing: expanded now-playing page offers 15/30/60 minutes or custom 1–1440 minutes, immediate/end-of-song modes, cancel/replace, remaining time and waiting feedback. The service uses monotonic time and pause-at-end; UI suspension does not own the timer. Service/process shutdown cancels it. No emulator or physical device was attached during this run; real lockscreen, long-duration, repeat behavior and battery-policy acceptance remain open.
- Verified local debug package: `artifacts/android/v0.1.15-b1013/debug/nanoPlayer-0.1.15-b1013-arm64-debug.apk`; applicationId `app.nanoplayer.android`, versionName 0.1.15 / versionCode 1013, arm64-v8a, minSdk 29, 209233054 bytes. aapt metadata, ZIP integrity and APK v2 debug signing pass. SHA-256: `3a0098a25210b20eec78f688a16bf493c9658d409a9aba16e51e3c29b4e3cfdf`. Local verification report: `artifacts/verification/v0.1.15/summary.md`. APK installation/launch and device gates were not run because no device was attached.

## 2026-09-27 implementation update

- Shared persisted library selection filters all browsing collections and playlist lists. Native root IDs handle opaque SAF document URIs; mixed playlist rows remain dimmed while excluded items are removed from the service queue, including recovered sessions.
- Library details show full source URI, original added date and indexed counts on demand. Phone and Pad appearance controls are inline; light-mode cover tint is reduced. A/B/C comparisons were reviewed and A (16% tint, no blur) selected.
- 49 Vitest tests and 68 browser E2E tests pass. Browser views at 390px and 800px have been visually checked for settings alignment and overflow. Browser evidence is separate from the native package checks below.

## Implemented

- Independent Android entry point/application ID `app.nanoplayer.android`, API 29 minimum; shared Rust database and library/lyrics/metadata/backup commands. Desktop audio/window/menu/updater initialization stays in `desktop.rs`.
- SAF read-only persistent tree grants, metadata and same-directory LRC scanning, cancellation, permission diagnostics, private embedded-artwork cache, system-picker lyric/playlist-cover imports.
- Additive URI resource migration: tree/document/content URI identities, stable Android track ID allocation, rescan retains track IDs, ratings and playlist associations.
- Media3 foreground service owns queue, playback, focus, headset disconnect handling and durable SQLite session journal. Activity/WebView destruction does not stop a playing queue. Process restoration does not autoplay.
- Frontend native adapter serializes commands and applies native snapshots without feedback. Library refresh cannot replace the service queue. Rust merges session events by unique session ID; acknowledgements check the exact listened/count values. UI preference saves cannot overwrite native counts.
- Shared desktop visuals and components. Phone has home/library/playlists navigation, library tabs and compact player; Pad keeps desktop menu names/order, with a fixed icon-only sidebar at 600–900px, scrollable wide tables, touch sizes and long-press More menu.
- Android appearance choices read 系统/浅色/深色 and occupy compact equal cells inline with the label. Home song cards use the user-selected A treatment: 16% panel tint, a subtle inset outline and no blur. Cover-derived background now extends behind the transparent header and fades into the system-bar surface.
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

## 2026-09-23 local package evidence

- `v0.1.13-b1011` arm64 debug APK built and verified at `artifacts/android/v0.1.13-b1011/debug/nanoPlayer-0.1.13-b1011-arm64-debug.apk` (209,194,454 bytes).
- SHA-256: `086e82fbb5ecc3ba961cc9439c6362492190b943292c20f4859f7c1b9170c4b2`; Android debug certificate and APK v2 signature verified. This is a local test package, not a signed production release.
- `pnpm check` passed (44 Vitest tests); `pnpm test:e2e` passed (66 tests), including 600/840px fixed Pad sidebar and phone theme choices; `pnpm website:build`, version consistency, Rust tests and Android build passed.
- No emulator or physical device was connected for this build. Installation, rotation and split-screen on device remain to be checked.

## 2026-09-27 package and emulator evidence

- `v0.1.14-b1012` arm64-v8a debug APK: `artifacts/android/v0.1.14-b1012/debug/nanoPlayer-0.1.14-b1012-arm64-debug.apk`, 209,218,878 bytes.
- SHA-256: `d98f5922dcc77a8ca69771e5c34d0fea1fce7f2fe4ea19e0bc2ab291015060be`. APK manifest versionName/versionCode/ABI and APK v2 Android Debug signature verified. This is a local test artifact, not a production-signed or publicly published Android release.
- API 36 arm64 phone and Pad emulators installed the package. Phone instrumentation: 3/3 passed, including playback without the WebView, sequential replay, shuffle traversal, journal recovery and source WAV byte identity. The fixture now explicitly resets persisted shuffle/repeat before the sequential scenario; the first attempt inherited shuffle and failed its sequential expectation. Application code did not change in this test repair.
- The test helper's rebuilt APK is byte-identical to the archived package above. Pad native WebView inspection verified inline appearance controls, original library creation date/URI details, and selection filtering from one fixture song to zero and back.
- Screenshots and detailed local evidence: `artifacts/verification/v0.1.14/`. Physical-device, manufacturer/background-duration and production-signing acceptance remain open.

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

## Historical local package evidence

- The last package recorded in this status file was `artifacts/android/v0.1.7-b1008/debug/nanoPlayer-0.1.7-b1008-arm64-debug.apk`.
- SHA-256: `26475ddab60c0c58f15f83117166e832c71f545cb8dac9d7eed0eaf6708c8685`
- Debug arm64 APK, 393,603,936 bytes; contains unstripped Rust debug symbols because Gradle could not strip the library. This is a development build, not the production size or release-signing result.
- Companion `manifest.json`, `SHA256SUMS` and `signing-verification.txt` were generated by the packaging script. No public upload occurred. This older artifact is not evidence for the current repository version; rebuild and report the current version/build number before claiming completion.
