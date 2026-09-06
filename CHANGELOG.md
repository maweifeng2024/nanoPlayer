# Changelog

All notable changes will be documented here following Keep a Changelog. Versions use Semantic Versioning.

## [Unreleased]

## [0.1.4] - 2026-09-06

## [0.1.3] - 2026-09-04

## [0.1.2] - 2026-09-04

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
