# iOS and iPadOS client

Status: native integration and lifecycle scripts implemented on 2026-10-14; Swift/Rust compilation and browser layout checks pass. Simulator launch, development-signed IPA export and iPhone installation are verified; audio, file-provider and Wi-Fi transfer acceptance remain pending.

0.1.24 implements the confirmed two-section resource library, first-level participation, explicit reference/copy confirmation, and authenticated Wi-Fi folder transfer with trash/restore. SDK 27.1 compilation, iPhone/iPad simulator HTTP transfer and development-signed build 7 IPA validation pass; physical-device qualification remains pending. See [library design](LIBRARY_DESIGN.md) and [current validation](STATUS.md); earlier iPhone installation evidence does not qualify this new build.

- [Library redesign](LIBRARY_REDESIGN.md): 2026-10-16 confirmed interaction and implementation contract; final iOS qualification pending.
- [Current status and evidence](STATUS.md).
- [Design proposal](DESIGN.md): iPhone/iPad layout and confirmed decisions and pending device/account information.
- [Development, testing and release workflow](WORKFLOW.md): setup, implementation gates, Xcode operations and artifact evidence.

## Reuse boundary

The intended client reuses the React feature UI, shared state/domain rules, Rust database and metadata logic, fixtures, design system, and release-version authority. Apple-specific file access, background audio, media controls, interruption handling, signing, and distribution must remain behind native/platform adapters.

The feasibility and technology trade-offs are recorded in [`../MOBILE_FEASIBILITY.md`](../MOBILE_FEASIBILITY.md). The required repository additions and command naming are defined in [`../../PROJECT_STRUCTURE.md`](../../PROJECT_STRUCTURE.md).

## Remaining qualification

- Confirm Tauri Apple-project/plugin boundaries and supported deployment targets.
- Verify the implemented read-only document/folder access, bookmark recovery and copied imports with actual file providers.
- Prove playback continuity, queue/session recovery, and source-file immutability with simulator/device tests.
- Exercise the existing scripts, build-number authority and local packaging against actual simulator/device artifacts.
- Define signing identities, provisioning, archive/export verification, and distribution channel without committing credentials.

The existing commands are listed in WORKFLOW.md. Source implementation, successful compilation, installed-device acceptance and public release are separate facts.
