# Android client

One Android client serves phone and Pad while reusing the shared product core.

- Architecture and approved behavior: [`PLAN.md`](PLAN.md)
- Current implementation and acceptance gaps: [`STATUS.md`](STATUS.md)
- Desktop/Pad parity contract: [`DESKTOP_PARITY.md`](DESKTOP_PARITY.md)
- Environment setup: [`INSTALL.md`](INSTALL.md)
- Packaging contract: [`../../../packaging/android/README.md`](../../../packaging/android/README.md)
- Commands: [`../../development/COMMANDS.md`](../../development/COMMANDS.md)

Public lifecycle commands are `pnpm android:doctor`, `pnpm android:build:debug`, `pnpm android:test:emulator`, and `pnpm release:android`. Android packaging is local-only until the documented public-release gates pass.
