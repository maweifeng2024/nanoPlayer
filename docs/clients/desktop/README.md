# Desktop client

The desktop client targets macOS, Windows, and Linux through the shared React UI and Tauri/Rust core.

- Current implementation and qualification: [`STATUS.md`](STATUS.md)
- Updater behavior and historical recovery evidence: [`AUTO_UPDATE.md`](AUTO_UPDATE.md)
- Packaging/publication: [`../../release/RELEASE_PROCESS.md`](../../release/RELEASE_PROCESS.md)
- Platform package matrix: [`../../release/DISTRIBUTION_MATRIX.md`](../../release/DISTRIBUTION_MATRIX.md)
- Commands: [`../../development/COMMANDS.md`](../../development/COMMANDS.md)

Public lifecycle commands are `pnpm tauri dev`, `pnpm tauri build`, `pnpm release:desktop`, and the default `pnpm release` alias.
