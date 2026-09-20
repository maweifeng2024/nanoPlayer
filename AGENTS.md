# Repository Guidelines

## Project Structure & Module Organization

The product and architecture baseline lives in `docs/PRODUCT_AND_TECHNICAL_PLAN.md`. Keep implementation status distinct from planned scope.

- `src/`: React/TypeScript UI, grouped by feature (`library/`, `player/`, `playlists/`, `lyrics/`).
- `src-tauri/src/`: Rust application core, with separate `audio`, `database`, `scanner`, `metadata`, and `lyrics` modules.
- `src-tauri/migrations/`: ordered SQLite migrations.
- `tests/fixtures/`: small, redistributable audio and metadata fixtures; never add personal music.
- `docs/`: product decisions, architecture notes, and acceptance criteria.
- `public/`: bundled static assets only.
- `website/`: Sites-based product introduction and download-status website.
- `packaging/` and `scripts/release/`: platform notes, entitlements, and release verification tools.

## Build, Test, and Development Commands

- `pnpm install`: install frontend and Tauri tooling.
- `pnpm tauri dev`: run the desktop app locally.
- `pnpm build`: type-check and build the frontend.
- `pnpm tauri build`: create a release application bundle.
- `pnpm test`: run Vitest tests.
- `cargo test --manifest-path src-tauri/Cargo.toml`: run Rust unit and integration tests.
- `pnpm lint` and `cargo fmt --check`: verify frontend and Rust style.
- `npm run build --prefix website`: validate the product/download website.

## Mandatory Versioning, Build, and Release Completion

Every completed product change must leave the repository with a new, installable version. Do not hand off a changed UI, behavior, packaging rule, or release script while reusing an already published desktop version or Android build number. The only exception is when the user explicitly requests a local-only experiment or says not to release.

1. Treat the root `package.json` version as the single desktop and Android `versionName` authority. Choose a new, unused stable semantic version and pass it explicitly to the release command; never recreate or move an existing `vX.Y.Z` tag.
2. Increment `packaging/android/version-code.json` exactly once for each new Android-installable build. Android `versionCode` must always increase, even when rebuilding the same `versionName`. Reuse that newly allocated code only when retrying the same failed build, and verify the generated APK manifest contains both the intended `versionName` and `versionCode`.
3. Before publishing, run the normal local gates without skipping them:
   - `pnpm check`
   - `pnpm test:e2e`
   - `cargo fmt --check --manifest-path src-tauri/Cargo.toml`
   - `cargo test --manifest-path src-tauri/Cargo.toml`
   - `npm run build --prefix website`
   - `pnpm tauri build --debug --bundles app`
4. Publish desktop code and artifacts from `main` with `pnpm release <new-version>`. There is no `pnpm push` command: `pnpm release` is the supported flow that versions, commits, creates the tag, pushes the branch and tag, waits for the desktop workflow, and verifies publication. Do not use `--skip-checks` for a real release.
5. If local checks fail before a tag is created, fix the problem and rerun `pnpm release <same-new-version>`; do not use `--resume` and do not allocate another version. If a tag already exists and the remote workflow or push was interrupted, commit and push the release-script fix when needed, then run `pnpm release --resume vX.Y.Z`; never move or recreate the tag.
6. After the version is synchronized and the desktop release succeeds, generate the phone/Pad test APK with `pnpm release:android -- --debug`. For production signing, use `pnpm release:android -- --build-only` with the required private signing environment. Android packaging does not push code or publish an APK by itself.
7. Do not report completion until the desktop build/release result and Android artifact have been checked. Report the released version and tag, desktop workflow result, APK absolute path, APK byte size, SHA-256, `versionName`, `versionCode`, ABI, and signature verification. If a required credential, network service, platform, or physical device blocks a gate, state that boundary explicitly instead of claiming success.

Keep version allocation and retries transactional: one intended release uses one semantic version and one Android build number. A failed retry must not silently create another version, and an APK path from an older build must never be presented as the current result.

## Coding Style & Naming Conventions

Use two-space indentation for TypeScript, CSS, JSON, and Markdown; rely on `rustfmt` for Rust. React components use `PascalCase.tsx`, hooks use `useCamelCase.ts`, and other TypeScript modules use `camelCase.ts`. Rust modules and functions use `snake_case`; types use `PascalCase`. Keep Tauri commands narrow and typed. UI code must not execute arbitrary SQL or access unapproved filesystem paths.

## Testing Guidelines

Use Vitest for UI and state logic, Rust tests for playback/library rules, and Playwright for critical desktop flows. Name TypeScript tests `*.test.ts(x)` and Rust integration tests by behavior, such as `tests/library_scan.rs`. Every filesystem test must prove source audio remains byte-identical. Cover damaged files, permission loss, rescans, queue recovery, and play-count thresholds.

## Commit & Pull Request Guidelines

The repository has Git history and published desktop releases. Use Conventional Commits, for example `feat(library): add folder rescan`. Keep commits focused. Pull requests must explain behavior changes, link the relevant plan section or issue, list verification commands, and include screenshots for UI changes. Call out database migrations, permission changes, and any source-file write risk explicitly.

## Security & Local-First Rules

Treat music directories as read-only. Store ratings, playlists, statistics, downloaded lyrics, and artwork caches in application-managed storage. Online lyric lookup must be opt-in, disclose transmitted metadata, and fail without interrupting playback.
