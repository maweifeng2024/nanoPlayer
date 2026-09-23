# Desktop implementation status

Updated: 2026-09-22 · Repository source/tag: 0.1.12 · Detailed verification below is dated where stated

This document separates implemented behavior from release qualification. “Implemented” means the path exists in code and has proportionate automated verification; it does not mean long-duration or signed-release gates have been completed.

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
- The repository and local tag are at v0.1.12. The checked-in website download manifest is still v0.1.11 as of 2026-09-22, so publication consistency must be reverified before citing a current public desktop version.
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
