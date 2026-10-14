# Architecture overview

The React UI communicates with a narrow Tauri command/event layer. Rust owns approved filesystem roots, metadata normalization, SQLite, lyrics providers, and playback. The UI must not execute SQL or receive unrestricted filesystem capabilities.

## Runtime boundaries

1. Scanner workers read approved roots and produce normalized batches.
2. A serialized database writer applies migrations and library changes.
3. The audio thread decodes and outputs media without waiting on scans, network requests, or database writes.
4. Lyrics providers are optional adapters; embedded and sidecar lyrics work offline.
5. User state and caches live in application-managed storage, never beside source audio by default.

Desktop audio output uses rodio/cpal platform backends. Desktop media controls in `src/player/PlayerBar.tsx` use the WebView's `navigator.mediaSession`; dedicated desktop Now Playing, SMTC, and MPRIS adapters are not implemented and must not be inferred from package availability. Android uses Media3; the first iOS integration uses AVPlayer and native Now Playing/remote commands, with device acceptance pending.

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
- `src-tauri/migrations`: five ordered migrations (`0001`–`0005`): base library, app state/caches, artist relationships, scan runs, and user features (metadata overrides, normalized playlists and custom artwork).
- `src/updates`: desktop update checking, installation and restart; release scripts generate signed updater metadata independently of OS code signing.

Desktop playback completion/queue advance and periodic state saving depend on frontend timers (`PlayerBar.tsx`, `App.tsx`). Android uses its native media-service/session path instead of assuming the WebView remains active. See [mobile feasibility](../clients/MOBILE_FEASIBILITY.md) and [Android status](../clients/android/STATUS.md).

The iOS entry is `src-tauri/src/ios.rs`, with Swift sources under `src-tauri/plugins/nanoplayer-mobile/ios/`. Swift owns authorized documents, copied imports, native playback/queue, journal/timers and foreground Wi-Fi receiving; Rust owns the shared database and scanner. `src/platform/mobile.ts` routes transport and mobile UI without pulling desktop audio/updater initialization into Apple mobile builds. Compile evidence and unverified lifecycle/device boundaries are in [iOS status](../clients/ios/STATUS.md).

The approved iOS resource library uses `IOSLibraryPage` and `NativeLibrary` to separate managed content, Files references and exposed folders from other music apps. Only `Documents/Music` may be mutated: copied imports are coordinated and byte-verified before committing, folder/file moves have a durable intent journal, and Rust updates paths transactionally without changing track IDs. External references stay read-only, with explicit source UUIDs, display-name collision rules and persisted relative indexing scope. Internal recovery actions cannot be called through the iOS frontend bridge; iOS does not grant direct mobile-plugin dispatch permission. System audio-open requests are staged in application support until the user selects a managed destination. Provider permissions, actual sharing/network behavior and interrupted recovery still require device acceptance.

## Recovery and safety

- Startup restores state without autoplay, then performs a differential scan of approved roots.
- Watcher events are debounced and trigger reconciliation rather than being treated as authoritative state.
- Database backups use SQLite backup APIs and pass integrity checks before restore.
- Diagnostics contain platform/version/count/integrity/category data, not paths, filenames, titles, or lyrics.
- No command writes tags, moves media, deletes source files, or lets the UI execute SQL.

## Upgrade and playback timing contract

SQLite `PRAGMA user_version` is the shared schema authority (currently 6). Startup applies only pending migrations in one transaction before exposing a library snapshot. Existing pre-versioned installations are adopted by detecting `library_roots` and applying the idempotent supplemental migrations. Failure rolls back the whole upgrade and prevents startup queries against a partial schema. Databases with a newer schema are rejected with a compatibility error. A product version change does not itself require a schema increment; every schema change must append a migration and increment the schema authority. Never modify already-applied migration SQL to change an installed schema.

Frontend preference schema 4 migrates both Zustand/localStorage and native app-state restoration. Future state schemas are rejected before write-back. Lyric offsets and font size receive defaults and numeric bounds; malformed queue, mode, numeric and boolean preference shapes are normalized; valid ratings, queues and existing preferences are retained. Native saved state includes `stateSchemaVersion`; localStorage uses Zustand's version. Transient sleep timer state is excluded from saved preferences.

Android `PlaybackService` owns sleep timers using `SystemClock.elapsedRealtime`, so an Activity/WebView suspension cannot stop the countdown. At expiry, immediate mode pauses; finish-song mode enables ExoPlayer's pause-at-end behavior, including repeat playback. A manual skip while waiting also pauses. Cancellation or replacement clears the pending pause-at-end flag. Snapshots restore the visible remaining time when the UI returns. Service destruction cancels the timer; restarting the process never restarts playback or an old timer. Physical-device battery/lockscreen acceptance remains separate from unit tests.
