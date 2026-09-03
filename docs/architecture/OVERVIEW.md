# Architecture overview

The React UI communicates with a narrow Tauri command/event layer. Rust owns approved filesystem roots, metadata normalization, SQLite, lyrics providers, and playback. The UI must not execute SQL or receive unrestricted filesystem capabilities.

## Runtime boundaries

1. Scanner workers read approved roots and produce normalized batches.
2. A serialized database writer applies migrations and library changes.
3. The audio thread decodes and outputs media without waiting on scans, network requests, or database writes.
4. Lyrics providers are optional adapters; embedded and sidecar lyrics work offline.
5. User state and caches live in application-managed storage, never beside source audio by default.

Platform integrations belong behind small adapters: CoreAudio/Now Playing on macOS, WASAPI/SMTC on Windows, and PipeWire or ALSA/MPRIS on Linux.

## Implemented flow

1. The native folder picker returns one or more user-approved roots. Rust canonicalizes each root, ignores symbolic links, and scans supported audio using read-only handles.
2. The scanner compares size, modification time, and sidecar-lyrics fingerprints with SQLite. Unchanged files reuse indexed metadata; changed files are parsed through lofty and emitted with progress events.
3. A transaction updates media identity, availability, normalized albums, multi-value track artists, album artists, lyrics, artwork, FTS rows, issues, and scan history. A missing file is marked unavailable so ratings and playlist references survive.
4. React receives a typed library snapshot. Zustand owns transient interaction state and mirrors playlists, ratings, counts, queue, position, theme, output choice, and first-run state to the Rust-managed SQLite application state.
5. Playback resolves a track ID through the database instead of accepting arbitrary UI file paths. Rodio owns decoding, seeking, volume, and selected output-device streams. Session checkpoints update play counts without treating seek distance as listening time.
6. The optional LRCLIB adapter receives title, artist, album, and duration only after the user enables online lyrics. Selected results are cached in SQLite and can be removed per track or globally.

## Main code ownership

- `src/library`, `src/player`, `src/lyrics`: browsing, tables, playlists, responsive UI, queue/player controls, and lyric rendering.
- `src/store.ts`: client state transitions, recovery rules, unavailable-file fallback, and persisted UI preferences.
- `src/tauriBridge.ts`: the narrow typed command boundary.
- `src-tauri/src/scanner`, `metadata`, `database`, `audio`, `lyrics`: filesystem, tag normalization, SQLite ownership, playback, and provider logic.
- `src-tauri/migrations`: ordered, idempotent schema additions. The current sequence adds the base library, app state/caches, artist relationships, and scan runs.

## Recovery and safety

- Startup restores state without autoplay, then performs a differential scan of approved roots.
- Watcher events are debounced and trigger reconciliation rather than being treated as authoritative state.
- Database backups use SQLite backup APIs and pass integrity checks before restore.
- Diagnostics contain platform/version/count/integrity/category data, not paths, filenames, titles, or lyrics.
- No command writes tags, moves media, deletes source files, or lets the UI execute SQL.
