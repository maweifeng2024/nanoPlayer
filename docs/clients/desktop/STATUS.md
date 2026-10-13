# Desktop implementation status

Updated: 2026-10-13 · Local source: 0.1.18 · Published desktop: 0.1.14 · Detailed verification below is dated where stated

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

- v0.1.15 tag build 38362786908 failed verification before any desktop platform build: CI Rust 1.99 Clippy rejected three unnecessary closure borrows in lyric requests. Publishing recovery 38363315079 therefore failed provenance validation; retrying publication cannot repair this tagged source.
- 0.1.16 removes those borrows and adds local recovery preflight for unsuccessful verification/platform jobs, covered by four regression tests. Publication remains user-run with `pnpm release 0.1.16` from main. Local Rust is 1.98; CI 1.99 and desktop installers remain remote acceptance work. See `artifacts/verification/v0.1.16/summary.md`.

This document separates implemented behavior from release qualification. “Implemented” means the path exists in code and has proportionate automated verification; it does not mean long-duration or signed-release gates have been completed.


## 2026-10-13 local implementation (0.1.15)

- Shared UI: 12px auxiliary text, 44px medium controls and Android minimum touch targets; all shared song-list rows reserve an artwork-safe playback-accent gutter.
- Shared lyrics: memoized plain/enhanced LRC parsing, progressive word fill, synchronized multiline display, persistent 16–40px font size and per-song ±10-second correction. The drawer and expanded player share word rendering. Online lookup remains opt-in LRCLIB; macOS system overlays, translation generation and additional providers are not implemented by this change.
- Upgrade safety: transactional SQLite schema migration/adoption (user_version 6), failed-upgrade rollback and newer-schema rejection; frontend/native preference schema 4 defaults, numeric/shape validation, future-version guard and immediate write-back.
- Verified locally: 54 Vitest tests, 76 browser E2E tests (including visual baselines at desktop/phone/Pad sizes), Rust format/clippy, 18 Rust tests plus the explicit 10,000-row FTS benchmark, source-byte preservation test, 15 release-script tests and website build pass. Android plugin compilation and all 10 native unit tests pass (five cover sleep timing).
- Desktop publication and installers remain user-run: `pnpm release 0.1.15` from main. No tag/push/desktop publication was performed for this change. Native desktop appearance and cross-version installer testing remain release acceptance work.

## 2026-09-27 implementation update

- Library selection is persisted in local/native user state and applied to home, songs, search, albums, artists and statistics. Mixed playlists remain visible with excluded rows dimmed; their playback queue excludes those rows. Changing selection prunes the current queue and advances an excluded current track, or stops if nothing remains.
- Library cards default to folder names, with expandable path, original added date, song count, size and scan date. Native snapshots expose root identity independently of paths.
- Playlist row menus no longer offer adding to another playlist. The online-lyrics switch is centered, light-mode artwork tint is reduced, and the desktop ambient layer fades vertically into the header.
- Current verification: 49 Vitest tests, 68 browser E2E tests, Rust formatting/clippy, 16 Rust tests, the explicit 10,000-row search benchmark and the website build pass. Browser selection coverage includes desktop and Android. Published artifact evidence remains separate from local checks. No source-media writes were introduced.

## Implemented vertical slice

- Multi-folder selection, canonical read-only roots, cancellable recursive scans, startup differential scans with progress, scan-run history, explicit unsupported/damaged/permission issues, stable file identity across moves, and debounced live filesystem reconciliation.
- MP3, M4A/AAC, FLAC, WAV, Ogg Vorbis, Opus, AIFF, and ALAC routing; normalized title/album/disc/track/date/genre/composer/audio properties/MusicBrainz ID; multi-value track-artist and album-artist relationships; embedded artwork and lyric extraction.
- SQLite in the application data directory with foreign keys, WAL, FTS5, application-state persistence, listening sessions, network-lyric and artwork caches, integrity-checked online backup/restore, and cache clearing.
- Source-safe root removal: only application index/cache rows are removed; the backend has no source write, move, tag-edit, or delete command.
- Home, songs, album/artist collection and detail, multi-disc album grouping, a flat artist track list, recent/played-only most-played/high-rated, roots, grouped issues, editable playlists with automatic or app-managed custom covers, immersive now-playing, queue/lyrics drawer, and settings views. Genre remains searchable metadata but no longer has a primary navigation page.
- SQLite FTS5 global search, sortable/windowed tables with an independent artist column, app-native dialogs, song details and reversible app-local metadata overrides, right-click and batch actions, 1–5 star ratings, playlist/queue drag ordering, independent sequence/shuffle and off/all/one repeat controls, unavailable-file fallback, recoverable queue/position/preferences, and normalized SQLite playlist restoration without autoplay.
- Native rodio playback load/play/pause/seek/volume with explicit autoplay, real backend position/paused/empty status, visible progress fill, enumerated output-device switching and default-output reconnection preserving position/state, natural-completion play counting, WebView Media Session controls, native menus, draggable title regions, and keyboard shortcuts.
- Local lyric priority (manually selected UTF-8 LRC/TXT copied into app data, embedded synchronized, sidecar LRC, network synchronized, embedded plain, sidecar TXT, network plain), manual replacement/removal, LRC offset/repeated timestamps, synchronized scrolling and clickable lines, editable LRCLIB search metadata, normalized multi-stage fallback, scored candidate selection with match reasons/duration differences/previews, classified errors and throttling, reversible cache, default-off privacy control, and source/kind labels.
- First-run guidance, empty/error states, responsive 720/900/desktop layouts, keyboard focus paths, and dark-default plus optional system/light themes. Existing pre-design-version state migrates once to the approved dark baseline.
- The home page presents recent, most-played, and highly rated tracks in three compact title-only columns with at most 20 entries each. Recent Played is no longer a primary navigation item, and rating is the second data column in full song tables.
- The home hero no longer shows aggregate count cards. On each home-page mount it chooses one contextual welcome (returning home chooses again) from recent listening, most-played/highest-rated music, a familiar artist, or a short music reflection, with playback tied to the referenced track.
- The packaged application uses the generated nanoPlayer icon on supported platforms. The in-window sidebar uses a text-only wordmark and a 64 px macOS title-bar safe area so it does not compete with traffic-light controls.
- The current icon master is a flatter black/red rounded square with true transparent margins and no gray bezel. The main window restores its last saved size and position. On macOS, closing the window hides it without stopping playback; Dock reopen shows it again, and only the application Quit command or `Command+Q` terminates the process.
- Browser demo data is used only outside Tauri so interface tests and product review do not require personal music.

## Current verification and historical evidence

- 2026-09-11: `pnpm check` passed lint, 30 Vitest tests, TypeScript and production frontend build; release-script regression tests passed 11/11; browser E2E passed 27/27 and the website production build passed. Version consistency check passed for 0.1.7.
- The 2026-09-11 browser/Rust verification and its environment limits are recorded in [the archived audit](../../archive/audits/DOCUMENTATION_AUDIT_2026-09-11.md); historical counts below are not current-run results.
- Historical native evidence: macOS Debug and Release `.app` builds, window/icon inspection, lyric candidate selection, folder filtering and home artwork were recorded in the [archived plan](../../archive/plans/BUGFIX_AND_FEATURE_PLAN_2026-09-03.md) and [updater record](AUTO_UPDATE.md). This status update does not repeat audible/native installation tests.
- Historical Rust evidence: 15 passed, two explicitly ignored (live network and benchmark). The recorded 10,000-row FTS5 P95 was 1.89 ms on 2026-09-03, not a fresh performance result.
- Current editable icon master: `docs/design/nanoplayer-app-icon-v3.png`; old v1 byte sizes/screenshots are not current-bundle verification.

## Latest implemented additions and distribution

- Folder multi-selection intersects search and remains available for zero results; most-played tables omit duration, and home artwork follows its contextual track with built-in SVG fallback.
- Chinese/English UI, full natural-completion play counting, and automatic desktop update checking (5 seconds after startup, then every 6 hours), manual download/install/restart are present in code.
- v0.1.14 was published on 2026-09-27. Workflow 36312551912 passed all three platform builds, publication, website deployment and live v0.1.14 manifest checks. The macOS archive was independently checked for version 0.1.14, x86_64 + arm64, published SHA-256 and updater signature validity. macOS remains ad-hoc signed (no Apple Developer ID/notarization acceptance). Windows/Linux native installation remains separately unverified.
- OS code signing remains marked false in the download manifest; updater signatures are a separate mechanism. Package publication does not prove physical-device playback or cross-version installation.

## Remaining release qualification (external/manual gates)

- Run the redistributable eight-format fixture matrix, filesystem event-storm benchmark, gapless matrix, sleep/wake, physical output-device switching, media-key/Control Center, full VoiceOver, 200% scale, and eight-hour soak on release hardware.
- Validate database backup/restore and abnormal-process/WAL recovery through full native UI scenarios on a disposable library.
- Profile cold scan, scrolling, memory, energy, and scan-while-playing with a representative 10,000-track library; the isolated FTS5 P95 gate is automated, but it is not a substitute for this system test.
- Live LRCLIB lookup has been verified with the explicit public test metadata `一生何求 / 陈百强 / 华纳至尊无敌影视金曲`; the test returned candidates without transmitting metadata from the user's library. Service availability, rate limits, and upstream schema changes remain release-time checks.
- The macOS universal DMG is published; clean-machine Intel/Apple Silicon qualification, Developer ID signing and notarization remain unclaimed. Windows/Linux hardware playback and all three platforms’ cross-version updater installation/restart still require native evidence.

## User-feedback regression

- The 2026-09-03 feedback set is represented by automated flows for stopped startup restoration, backend progress, responsive drawers, first-click album/artist switching, played-only ranking, app-native playlist editing, song details, metadata overrides, and lyric error handling.
- Native macOS review is recorded separately from browser automation. Automated checks do not substitute for audible output, physical-device switching, long playback, sleep/wake, or energy profiling.

## Safety boundary

Only paths returned by the native folder picker are passed to the Rust scanner. The scanner canonicalizes roots, ignores symbolic links, opens media only for metadata reads, and records failures without stopping the rest of the import. Removing a root deletes its application index in a transaction and never calls a filesystem deletion API.

## 2026-10-14 local 0.1.19 verification

- Saved ratings now use visibly filled gold stars; rating changes are saved immediately to native state. Unchanged persisted fields skip serialization during navigation.
- Local shared checks, Rust formatting/Clippy/tests, 10k FTS gate, release-script tests and website build passed. Browser screenshot confirms ratings; desktop installers/publication remain user-run with `pnpm release 0.1.19` from `main`.
- [Detailed verification and client boundaries](../../archive/2026-10-14-ratings-scan-startup-review.md).
