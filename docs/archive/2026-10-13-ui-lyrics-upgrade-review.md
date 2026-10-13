# UI, lyrics and upgrade review — 2026-10-13

Target local version: 0.1.15; Android versionCode: 1013. Publication remains user-run.

## Findings and changes

| Finding | Implementation | Evidence boundary |
| --- | --- | --- |
| Song artwork touched the inset playback stripe on Android | Shared 12px inline row gutter, retained in Android overrides | Desktop 1200px, Pad 600px and phone 390px browser assertions and screenshots |
| 11px auxiliary text and mixed button sizing | 12px micro token, 44px medium controls and Android minimum targets | Browser critical flows; physical large-font acceptance still open |
| Lyrics parsed repeatedly on progress updates; no word timing or user offset | Memoized parser, Enhanced LRC word times, progressive word fill, persistent font/offset controls, shared immersive renderer | Parser and browser tests; ordinary LRC keeps line timing |
| SQL files reran independently without an upgrade ledger | Transactional sequential migration using user_version, legacy adoption and future-version rejection | In-memory legacy preservation, idempotence and rollback tests |
| Timer in WebView would stop running in the background | Monotonic native service timer, ExoPlayer pause-at-end, native countdown snapshots | Native compilation/state tests; no attached device |

## Lyrimuse research and chosen scope

Primary references: [product presentation](https://yudaotor.github.io/lyrimuse/zh/), [upstream README](https://github.com/Yudaotor/lyrimuse/blob/main/README.zh-CN.md), and [LRCParser source](https://github.com/Yudaotor/lyrimuse/blob/main/lyrimuse/Sources/LyrimuseCore/Lyrics/LRCParser.swift). Source was fetched for inspection; implementation here is independently written for React/Tauri.

Lyrimuse combines timed lyrics, karaoke presentation, translation/pronunciation, offsets, multiple lyric providers, caching and several macOS display surfaces. nanoPlayer adopts synchronized/progressive presentation, per-track correction, font control and existing manual/offline cache behavior in its drawer and expanded player. It retains LRCLIB as the opt-in network provider. This change does not implement twelve-provider aggregation, generated pronunciation/translation, TTML/YRC/QRC parsing, macOS floating windows/menu-bar/notch/touch-bar lyrics or external player control. Enhanced LRC files carry their own word times; plain LRC is not guessed into word timing.

## Local verification

Local gates: 54 Vitest tests, 76 browser E2E tests, 18 Rust tests plus the ignored-by-default FTS benchmark, Rust format/clippy, 10 Android native unit tests, 15 release-script tests and website build passed. The source-byte preservation fixture passed. Android 0.1.15-b1013 arm64 debug APK packaging, aapt metadata, ZIP integrity, SHA-256 and v2 signature checks passed; metadata is recorded in the current Android STATUS. Screenshots are local outputs under `artifacts/ui/october-*`; packaged APKs are under `artifacts/android/v0.1.15-b1013/`. An old APK is not evidence for this version. No phone/emulator was listed by adb during this run.
