# nanoPlayer first-version implementation status

Updated: 2026-09-03

This document separates implemented behavior from release qualification. “Implemented” means the path exists in code and has proportionate automated verification; it does not mean long-duration or signed-release gates have been completed.

## Implemented vertical slice

- Multi-folder selection, canonical read-only roots, cancellable recursive scans, startup differential scans with progress, scan-run history, explicit unsupported/damaged/permission issues, stable file identity across moves, and debounced live filesystem reconciliation.
- MP3, M4A/AAC, FLAC, WAV, Ogg Vorbis, Opus, AIFF, and ALAC routing; normalized title/album/disc/track/date/genre/composer/audio properties/MusicBrainz ID; multi-value track-artist and album-artist relationships; embedded artwork and lyric extraction.
- SQLite in the application data directory with foreign keys, WAL, FTS5, application-state persistence, listening sessions, network-lyric and artwork caches, integrity-checked online backup/restore, and cache clearing.
- Source-safe root removal: only application index/cache rows are removed; the backend has no source write, move, tag-edit, or delete command.
- Home, songs, album/artist collection and detail, multi-disc album grouping, a flat artist track list, recent/played-only most-played/high-rated, roots, grouped issues, editable playlists with automatic or app-managed custom covers, immersive now-playing, queue/lyrics drawer, and settings views. Genre remains searchable metadata but no longer has a primary navigation page.
- SQLite FTS5 global search, sortable/windowed tables with an independent artist column, app-native dialogs, song details and reversible app-local metadata overrides, right-click and batch actions, 1–5 star ratings, playlist/queue drag ordering, four playback modes, unavailable-file fallback, recoverable queue/position/preferences, and normalized SQLite playlist restoration without autoplay.
- Native rodio playback load/play/pause/seek/volume with explicit autoplay, real backend position/paused/empty status, visible progress fill, enumerated output-device switching and default-output reconnection preserving position/state, session threshold accounting, Media Session controls, native menus, draggable title regions, and keyboard shortcuts.
- Local lyric priority (manually selected UTF-8 LRC/TXT copied into app data, embedded synchronized, sidecar LRC, network synchronized, embedded plain, sidecar TXT, network plain), manual replacement/removal, LRC offset/repeated timestamps, synchronized scrolling and clickable lines, editable LRCLIB search metadata, normalized multi-stage fallback, scored candidate selection with match reasons/duration differences/previews, classified errors and throttling, reversible cache, default-off privacy control, and source/kind labels.
- First-run guidance, empty/error states, responsive 720/900/desktop layouts, keyboard focus paths, and dark-default plus optional system/light themes. Existing pre-design-version state migrates once to the approved dark baseline.
- The home page presents recent, most-played, and highly rated tracks in three compact title-only columns with at most 20 entries each. Recent Played is no longer a primary navigation item, and rating is the second data column in full song tables.
- The home hero no longer shows aggregate count cards. On each application launch it chooses one stable, contextual welcome from recent listening, most-played/highest-rated music, a familiar artist, or a short music reflection, with playback tied to the referenced track.
- The packaged application uses the generated nanoPlayer icon on supported platforms. The in-window sidebar uses a text-only wordmark and a 64 px macOS title-bar safe area so it does not compete with traffic-light controls.
- The current icon master is a flatter black/red rounded square with true transparent margins and no gray bezel. The main window restores its last saved size and position. On macOS, closing the window hides it without stopping playback; Dock reopen shows it again, and only the application Quit command or `Command+Q` terminates the process.
- Browser demo data is used only outside Tauri so interface tests and product review do not require personal music.

## Automated evidence

- `pnpm check`: TypeScript, lint, 14 Vitest tests, and production Vite build.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` and `cargo fmt --check`: warning-free Rust static/style checks.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 15 passing Rust tests plus two explicit ignored tests (benchmark and live-network lookup), including cancellation, incremental-scan reuse, FTS query escaping, migrations, backup/restore, diagnostic redaction, artwork data URL, confidence scoring and query normalization, per-field metadata override reversibility, manual lyric persistence, normalized playlist persistence, and byte-for-byte proof that damaged-file scanning leaves the source unchanged.
- `cargo test --manifest-path src-tauri/Cargo.toml live_chinese_search_returns_candidates -- --ignored --nocapture`: public LRCLIB lookup for `一生何求 / 陈百强 / 华纳至尊无敌影视金曲` returned candidates successfully.
- `cargo test --manifest-path src-tauri/Cargo.toml search_benchmark_10000_tracks -- --ignored --nocapture`: 10,000-row FTS5 P95 measured at 1.89 ms on the 2026-09-03 development host (target < 100 ms).
- `pnpm test:e2e`: nine passing Playwright flows, including song details and app-local editing, preserved double-click playback, first-click album/artist switching, flat artist tracks, app-dialog playlist creation/rename/add, played-only most-played, visible progress, drawer overflow prevention, and the 720 px responsive path.
- The current Playwright suite contains 13 passing flows, including the three title-only home lists, absence of the Recent Played navigation item, rating-column order, and the prior playlist/playback regressions.
- `npm run build --prefix website`: product/download website build.
- Both `pnpm tauri build --debug --bundles app` and `pnpm tauri build --bundles app` completed. The release `.app` was cold-launched and its native accessibility tree confirmed that online search renders eight selectable candidates with confidence, duration difference, match reasons, lyric type, and preview text without automatically caching a result.
- Bundle inspection confirms `CFBundleIconFile=icon.icns`; `Contents/Resources/icon.icns` exists and is 1,821,858 bytes. The extracted 1024 px representation visually matches `docs/design/nanoplayer-app-icon-v1.png`.
- Visual screenshots were inspected at desktop and 720 px widths. The current evidence is `test-results/nanoplayer-designed-home.png` and `test-results/nanoplayer-720.png`.

## Remaining release qualification (external/manual gates)

- Run the redistributable eight-format fixture matrix, filesystem event-storm benchmark, gapless matrix, sleep/wake, physical output-device switching, media-key/Control Center, full VoiceOver, 200% scale, and eight-hour soak on release hardware.
- Validate database backup/restore and abnormal-process/WAL recovery through full native UI scenarios on a disposable library.
- Profile cold scan, scrolling, memory, energy, and scan-while-playing with a representative 10,000-track library; the isolated FTS5 P95 gate is automated, but it is not a substitute for this system test.
- Live LRCLIB lookup has been verified with the explicit public test metadata `一生何求 / 陈百强 / 华纳至尊无敌影视金曲`; the test returned candidates without transmitting metadata from the user's library. Service availability, rate limits, and upstream schema changes remain release-time checks.
- Build Intel and Apple Silicon release artifacts and produce a signed/notarized DMG on a clean Mac. Signing, notarization, and cross-architecture qualification require release credentials/hardware and are not claimed here.

## User-feedback regression

- The 2026-09-03 feedback set is represented by automated flows for stopped startup restoration, backend progress, responsive drawers, first-click album/artist switching, played-only ranking, app-native playlist editing, song details, metadata overrides, and lyric error handling.
- Native macOS review is recorded separately from browser automation. Automated checks do not substitute for audible output, physical-device switching, long playback, sleep/wake, or energy profiling.

## Safety boundary

Only paths returned by the native folder picker are passed to the Rust scanner. The scanner canonicalizes roots, ignores symbolic links, opens media only for metadata reads, and records failures without stopping the rest of the import. Removing a root deletes its application index in a transaction and never calls a filesystem deletion API.
