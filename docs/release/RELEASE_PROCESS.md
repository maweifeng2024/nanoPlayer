# Release process

1. Freeze one version in root `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`; run `node scripts/release/check-version.mjs`.
2. Update `CHANGELOG.md`, implementation status, website copy, minimum OS requirements, and `website/public/downloads/latest.json`.
3. Run `pnpm check`, `pnpm test:e2e`, Rust formatting/lint/tests, website build, the 10,000-row FTS benchmark, and the read-only fixture hash test.
4. Build on each target operating system. Do not cross-sign or claim an untested installer.
5. Confirm the packaged icon and application identity before signing. On macOS verify `CFBundleIconFile`, the bundled `.icns`, the traffic-light safe area, dark/light appearance, Dock/Finder rendering, and clean-machine launch. Then sign macOS and Windows artifacts, notarize the DMG, and verify installation on a clean machine or VM.
6. Generate `SHA256SUMS.txt` with `node scripts/release/create-checksums.mjs <artifact-directory>`.
7. Publish artifacts, then update download URLs. Verify the live version, file size, checksum, and HTTP response for every advertised download.
8. Create release notes and tag `vX.Y.Z` only after all required gates pass.

Public announcements are a separate, explicitly approved step. A partially complete platform matrix must be labeled as such rather than blocking verified platforms or duplicating uploads.
