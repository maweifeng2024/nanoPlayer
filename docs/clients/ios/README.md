# iOS and iPadOS client

Status: planning only. No iOS/iPadOS native project, runnable command, package, signing configuration, or release is present in this repository.

## Reuse boundary

The intended client reuses the React feature UI, shared state/domain rules, Rust database and metadata logic, fixtures, design system, and release-version authority. Apple-specific file access, background audio, media controls, interruption handling, signing, and distribution must remain behind native/platform adapters.

The feasibility and technology trade-offs are recorded in [`../MOBILE_FEASIBILITY.md`](../MOBILE_FEASIBILITY.md). The required repository additions and command naming are defined in [`../../PROJECT_STRUCTURE.md`](../../PROJECT_STRUCTURE.md).

## Entry criteria for implementation

- Confirm Tauri Apple-project/plugin boundaries and supported deployment targets.
- Define read-only document/folder access and persistent authorization behavior.
- Prove playback continuity, queue/session recovery, and source-file immutability with simulator/device tests.
- Add `scripts/ios/`, `packaging/ios/`, a monotonic build-number authority, and root lifecycle commands together.
- Define signing identities, provisioning, archive/export verification, and distribution channel without committing credentials.

Until these criteria are implemented and verified, documentation must say “planned” and must not present proposed `ios:*` commands as runnable.
