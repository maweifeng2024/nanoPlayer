# Release process

1. Freeze one version in root `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`; run `node scripts/release/check-version.mjs`.
2. Update `CHANGELOG.md`, implementation status, website copy, minimum OS requirements, and `website/public/downloads/latest.json`.
3. Run `pnpm check`, `pnpm test:e2e`, Rust formatting/lint/tests, website build, the 10,000-row FTS benchmark, and the read-only fixture hash test.
4. Build on each target operating system. Do not cross-sign or claim an untested installer.
5. Confirm the packaged icon and application identity before signing. On macOS verify `CFBundleIconFile`, the bundled `.icns`, the traffic-light safe area, dark/light appearance, Dock/Finder rendering, and clean-machine launch. Then sign macOS and Windows artifacts, notarize the DMG, and verify installation on a clean machine or VM.
6. Generate `SHA256SUMS.txt` with `node scripts/release/create-checksums.mjs <artifact-directory>`.
7. Publish artifacts, then update download URLs. Verify the live version, file size, checksum, and HTTP response for every advertised download.
8. The one-command flow uses tag `vX.Y.Z` as the automation trigger; GitHub publishes the Release only after verification and all three platform-build jobs pass.

Public announcements are a separate, explicitly approved step. A partially complete platform matrix must be labeled as such rather than blocking verified platforms or duplicating uploads.

## One-command release

Run `pnpm release` from `main`. It increments the patch version by default, runs the local quality gates, commits every tracked and untracked change, creates and pushes the version tag, and starts `.github/workflows/release.yml`. Pass an explicit version for a minor or major release, for example `pnpm release -- 0.2.0`.

The GitHub workflow builds on macOS, Windows, and Linux, publishes one GitHub Release with checksums, updates `website/public/downloads/latest.json` from the actual uploaded artifacts, commits that manifest to `main`, and deploys the static website to Vercel. Configure these GitHub Actions repository secrets before the first run:

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` (required for website deployment).
- `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` (required for signed/notarized macOS releases).
- `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (required only when the Tauri updater is enabled).

The local command requires authenticated `gh` and Git access. Before choosing the next version it fetches tags and rebases `main` onto `origin/main` with `--autostash`, preserving tracked work while incorporating any website-manifest commit created by the previous release. The final branch-and-tag push is atomic; if that network operation is interrupted after the local release commit, rerunning the command with a clean worktree resumes the pending push instead of skipping a version. It intentionally stops before versioning if authentication is missing, a rebase cannot be completed safely, or the target tag already exists. `--skip-checks` is available only for diagnosing the automation and should not be used for a public release.

Repository Actions settings must allow GitHub Actions to create releases and push the generated website manifest to `main`. If `main` is protected, grant the workflow/bot an explicit bypass for this single generated-file commit or replace that step with a reviewed pull request.
