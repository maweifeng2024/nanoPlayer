# Changelog

All notable changes will be documented here following Keep a Changelog. Versions use Semantic Versioning.

## [Unreleased]

## [0.1.9] - 2026-09-18

## [0.1.8] - 2026-09-17

### Documentation

- Reconciled desktop v0.1.7 release, updater, icon, architecture and verification status on 2026-09-11; added mobile feasibility analysis only.

## [0.1.7] - 2026-09-08

- Release tooling validates arguments and recognizes successful recovery without duplicate deployment (included in tag).
- Published eight desktop packages plus updater signatures, manifest and checksums; GitHub publication timestamp is 2026-09-08 23:26 UTC (2026-09-09 in China).
- The local-push recovery fix was committed after this tag on main; it is tooling, not a v0.1.7 client binary change.

## [0.1.6] - 2026-09-08

- Added desktop automatic updates, signed updater manifests, folder multi-selection, responsive most-played tables, contextual home artwork/SVG fallback and simplified playlist subtitles.
- Artifact normalization and publishing recovery fixes landed after the tag on main.

> Version summaries 0.1.2–0.1.7 were reconstructed from Git tag differences on 2026-09-11. The older cumulative feature list under 0.1.1 is retained as historical documentation; current behavior and qualification are in `docs/development/FIRST_VERSION_STATUS.md`.

## [0.1.5] - 2026-09-07

- Added release completion watching, explicit asset publishing and Vercel secret setup; improved artifact checksum/website manifest handling.

## [0.1.4] - 2026-09-06

- Added Chinese/English interface and native menu localization, artwork-derived ambient backgrounds and UI refinements.
- Changed play-count rules to natural completion, with pause/resume, skipped/seeked tracks and repeat regression coverage.
- Refreshed actual product screenshots and website introduction.

## [0.1.3] - 2026-09-04

- Added a Tauri build wrapper that handles empty optional Apple signing variables without attempting an invalid certificate import.
- Improved release branch synchronization and interrupted push handling.

## [0.1.2] - 2026-09-04

- Isolated browser tests behind a temporary HTTP server/port; pinned the macOS build runner and improved release version/network handling.

## [0.1.1] - 2026-09-04

### Added

- Persistent main-window size and position restoration using an app-managed placement file.
- Read-only multi-root library scanning with cancellation, startup differential scans, progress events, debounced filesystem reconciliation, scan history, and categorized issues.
- SQLite/WAL migrations, FTS5 trigram search, normalized track/album artist relationships, application-state persistence, playback sessions, caches, backup/restore, and privacy-safe diagnostics export.
- Native playback, seeking, persistent volume indication, independent sequence/shuffle and off/all/one repeat controls, queue and playlist drag ordering, unavailable-file fallback, output-device enumeration/switching, native menus, and keyboard shortcuts.
- Songs, albums, artists, recent/played-only most-played/high-rated views; sortable windowed tables with artist columns; batch and context actions; song details; app-local metadata overrides; multi-disc and flat artist detail pages; full playlist editing and automatic/custom cover collages.
- Embedded, sidecar, and opt-in LRCLIB lyrics with source priority, confidence, reversible caching, LRC offset/repeated timestamp parsing, synchronized scrolling, and click-to-seek.
- Editable online-lyrics search fields and an explicit candidate picker showing confidence, match reasons, duration differences, lyric type, and a short preview before anything is cached.
- A three-column home library summary for recent, most-played, and highly rated tracks, capped at 20 title-only entries per section.
- Refined the three home lists into balanced music-summary panels with distinct restrained accents, icon headers, independent scrolling, and clearer hover/play feedback.
- Replaced the home statistics cards with a warm, launch-stable rotating welcome message drawn from recent listening, most-played and highly rated tracks, favorite artists, or short music reflections; its action plays the related track.
- First-run flow, settings, responsive 720/900/desktop layouts, dark/light/system themes, generated platform icons, product website, packaging guidance, and layered Vitest/Rust/Playwright verification.

### Changed

- Reworked the application icon to retain only the flatter black rounded-square and red nanoPlayer mark, with true transparent outer pixels and no gray metallic bezel.
- On macOS, the red close button and `Command+W` now hide the window while playback continues; Dock reopen restores the window, while the application menu and `Command+Q` still quit.
- Restored the approved dark red/black visual baseline as the default while retaining explicit system and light theme choices.
- Removed the application icon from the sidebar wordmark and reserved a 64 px macOS title-bar safe area for traffic-light controls.
- Removed the Genre primary navigation page while retaining genre metadata in search and song details.
- Removed the Recent Played primary navigation entry and moved rating immediately after the title in every full song table.
- Changed LRCLIB lookup to normalized, multi-stage matching: exact metadata, title/artist, normalized keyword, and title-only fallbacks, with deduplication, throttling, scoring, and actionable error categories.
- Limited playback-progress subscriptions to playback-dependent views to reduce avoidable React work during audio playback.
- Removed the redundant “资料库” group label above the primary sidebar navigation.
- Added per-field metadata reset, Finder reveal, manual LRC/TXT selection, and consistent Escape/focus-return behavior for application dialogs.

### Fixed

- Explicitly configured Tauri bundle icons so macOS packages contain `CFBundleIconFile` and `Contents/Resources/icon.icns`.
- Formatted persisted Unix timestamps as local dates instead of displaying raw seconds.
- Kept restored playback stopped until an explicit play action, synchronized the UI with native playback position, and added visible progress fill.
- Added draggable title regions and prevented the right drawer from squeezing song tables into overflow.
- Reset album/artist detail state on primary navigation changes, filtered zero-play tracks, and replaced playlist prompts with application dialogs.
- Replaced the remaining native confirmation prompts and made playback failures link directly to audio-output recovery.
- Made title-bar dragging repeatable, exposed a dedicated playlist drag handle with persisted ordering, and rebuilt automatic playlist collages after membership changes using the four most frequent artist-album artworks with randomized tie-breaking.
- Granted the native window-drag capability explicitly, switched playlist sorting to pointer-based dragging for WebView reliability, made playlist navigation selection reactive, constrained collage images to their grid cells, and separated title-only details clicks from whole-row double-click playback.
- Simplified playlist reorder feedback to an insertion line shown only during dragging, added above/below drop placement, and introduced accessible per-row move-up and move-down controls.
- Fixed LRCLIB candidate decoding when responses contain both `name` and `trackName`; malformed individual results are now skipped instead of discarding the full response.
