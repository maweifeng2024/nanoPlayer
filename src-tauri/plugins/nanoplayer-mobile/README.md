# Android native media plugin — implementation in progress

Owned native sources live here, independently of Tauri's generated application.

- `NanoPlayerPlugin.kt`: read-only SAF selection/enumeration and MediaController commands.
- `PlaybackService.kt`: Media3 queue, focus, noisy-route pause and service-owned progress.
- `PlaybackJournal.kt`: native SQLite checkpoint and idempotent playback session journal.
- `ListeningSession.kt`: natural-completion accounting, matching desktop rules.

No music file write/delete API is exposed. Folder grants request read only. Session state is private app data; Android app backup is disabled because document permissions cannot be restored from arbitrary backup data.

This is the stage A native boundary, not completed Android product support. Remaining gate work includes native build/device validation, background transition accounting verification and journal reconciliation with shared Rust library state. The desktop UI is not yet connected to this plugin. Do not publish this build or describe it as a working phone/Pad release.
