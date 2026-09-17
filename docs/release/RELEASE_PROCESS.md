# Release process

1. Treat root `package.json` as the version authority. `set-version.mjs` synchronizes Tauri config, Cargo manifest/lock, website package/lock and changelog; run `node scripts/release/check-version.mjs`.
2. Update `CHANGELOG.md`, implementation status, website copy and declared OS requirements. Generate `website/public/downloads/latest.json` only from published assets.
3. Run `pnpm check`, `pnpm test:e2e`, Rust formatting/lint/tests, website build, the 10,000-row FTS benchmark, and the read-only fixture hash test.
4. Build on each target operating system. Do not cross-sign or claim an untested installer.
5. Confirm the packaged icon and application identity before signing. On macOS verify `CFBundleIconFile`, the bundled `.icns`, the traffic-light safe area, dark/light appearance, Dock/Finder rendering, and clean-machine launch. Current preview packages may be unsigned and must say so. A signed release additionally requires macOS/Windows signing, macOS notarization, and clean-machine installation verification.
6. Generate `SHA256SUMS.txt` with `node scripts/release/create-checksums.mjs <artifact-directory>`.
7. Publish artifacts, then update download URLs. Verify the live version, file size, checksum, and HTTP response for every advertised download.
8. The one-command flow uses tag `vX.Y.Z` as the automation trigger; GitHub publishes the Release only after verification and all three platform-build jobs pass.

Public announcements are a separate, explicitly approved step. The current automated publisher requires complete updater artifacts and signatures for all three desktop platforms; incomplete input fails publication.

## One-command release

First configure CI deployment credentials with `node scripts/release/setup-vercel.mjs`. It reads the existing Vercel project link and prompts for a token using GitHub CLI's hidden input. A connector login does not provision GitHub Actions secrets.

`pnpm release` now waits for the tag's GitHub workflow and exits nonzero if builds, asset publishing, or deployment fails. After committing and pushing a publishing-script fix, use `pnpm release --resume vX.Y.Z`: it reuses the original tag artifacts with the current main publishing workflow. A rerun of an old build still uses its old source; never move an existing tag.

Run `pnpm release` from `main`. It increments the patch version by default, runs the local quality gates, commits every tracked and untracked change, creates and pushes the version tag, and starts `.github/workflows/release.yml`. Pass an explicit version for a minor or major release, for example `pnpm release -- 0.2.0`.

The GitHub workflow builds on macOS, Windows, and Linux, publishes one GitHub Release with checksums, updates `website/public/downloads/latest.json` from the actual uploaded artifacts, deploys the static website to Vercel, verifies it, then writes the generated manifest back to `main`. Configure these GitHub Actions repository secrets before the first run:

- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` (required for website deployment).
- `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` (required for signed/notarized macOS releases).
- `TAURI_SIGNING_PRIVATE_KEY` (required by the current updater publication flow); `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is optional for an unencrypted key.

The local command requires authenticated `gh` and Git access. Before choosing the next version it fetches tags and rebases `main` onto `origin/main` with `--autostash`, preserving tracked work while incorporating any website-manifest commit created by the previous release. The final branch-and-tag push is atomic; if that network operation is interrupted after the local release commit, `pnpm release --resume vX.Y.Z` with a clean worktree resumes the pending original push instead of skipping a version. It intentionally stops before versioning if authentication is missing, a rebase cannot be completed safely, or the target tag already exists. `--skip-checks` is available only for diagnosing the automation and should not be used for a public release.

Repository Actions settings must allow GitHub Actions to create releases and push the generated website manifest to `main`. If `main` is protected, grant the workflow/bot an explicit bypass for this single generated-file commit or replace that step with a reviewed pull request.

## Current status and recovery boundary (2026-09-11)

v0.1.7 is published with 13 assets; the local source and download manifest agree on 0.1.7. `--resume v0.1.7` is a recovery example, not an outstanding action. Recovery checks tag/source identity and already-running/completed workflows to avoid duplicate publication. Tests use mock/local services and do not themselves publish anything. Native cross-version updater installation remains separately unverified.

## Android preparation (2026-09-16)

`pnpm release` remains desktop by default. `pnpm release:desktop` or `pnpm release -- --platform desktop` explicitly selects it; existing version and resume arguments pass through unchanged. `pnpm release:android` / `--platform android` currently fails before any Git, version, signing or publishing operation. Unknown/duplicate platforms fail as well. This prevents an Android request from accidentally publishing desktop assets.

Android design and release requirements are in `../android/PLAN.md` and `../../packaging/android/README.md`. Android will use an independent tag/workflow/channel and monotonically increasing versionCode; no Android CI or product code has been enabled in this preparation stage.
