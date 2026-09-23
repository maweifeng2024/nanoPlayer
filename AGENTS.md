# Repository Guidelines

## Sources of Truth

- `docs/product/PRODUCT_AND_TECHNICAL_PLAN.md`: product scope and long-term technical baseline. Planned scope is not implementation status.
- `docs/clients/<client>/STATUS.md`: verified implementation and acceptance boundaries for one client.
- `docs/architecture/OVERVIEW.md`: shared runtime boundaries and dependency direction.
- `docs/release/RELEASE_PROCESS.md`: current release contract. `docs/development/COMMANDS.md` is the command reference.
- `docs/archive/`: dated evidence and superseded plans. Archive content is context, never the current operating rule.

When documents disagree, verify the implementation and executable scripts, then update the current document. Do not “fix” a current rule by editing an archived record.

## Repository Organization

- `src/`: shared React/TypeScript product UI and state, grouped by feature. Client differences belong behind `src/platform/` adapters or layout boundaries, not scattered platform checks.
- `src-tauri/src/`: shared Rust application core. Keep desktop-only initialization isolated from mobile entry points.
- `src-tauri/plugins/`: native capability plugins shared by mobile clients where appropriate.
- `src-tauri/gen/`: Tauri-generated native projects. Track only the source/configuration needed to reproduce a build; never commit local build output, SDK paths, or signing material.
- `tests/`: cross-client tests and redistributable fixtures. Never add personal music.
- `website/`: product and download website; it is a distribution surface, not an application client.
- `packaging/<client-or-os>/`: signing contracts, entitlements, manifests, and packaging metadata.
- `scripts/<client>/`: client-specific environment, build, and device helpers. Cross-client release orchestration stays in `scripts/release/`.
- `docs/clients/<client>/`: current client architecture, setup, status, and acceptance notes.

Do not move implementation into top-level `apps/` or duplicate shared UI/core code merely to make client folders look symmetrical. Add a client at its native integration boundary: shared code remains shared, while native, packaging, scripts, tests, and docs use the same client name (`desktop`, `android`, `ios`). See `docs/PROJECT_STRUCTURE.md`.

## Client Command Contract

Use root `package.json` scripts as the public entry point. Existing commands are authoritative; when a new client becomes executable, add the same lifecycle where applicable:

- `<client>:doctor`: read-only toolchain diagnosis.
- `<client>:dev`: local simulator/device development entry.
- `<client>:build:<variant>`: local build without publication.
- `<client>:test:<target>`: client integration or device tests.
- `release:<client>`: versioned, verified artifact creation; publication behavior must be explicit.

Do not document a command before it exists. A client README must state unsupported stages instead of inventing placeholders. Keep client-specific implementation inside its helper; callers should not need to reproduce long native commands.

## Build and Test Commands

- `pnpm install`: install frontend and Tauri tooling.
- `pnpm tauri dev`: run the desktop app locally.
- `pnpm build`: type-check and build the shared frontend.
- `pnpm test`: run Vitest tests.
- `pnpm test:e2e`: run browser-level critical flows.
- `cargo test --manifest-path src-tauri/Cargo.toml`: run Rust tests.
- `pnpm lint` and `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: verify style.
- `pnpm website:build`: validate the website.
- `pnpm android:doctor`, `pnpm android:build:debug`, `pnpm android:test:emulator`: Android lifecycle commands.

See `docs/development/COMMANDS.md` for arguments and boundaries.

## Versioning and Release Completion

Every completed product, runtime, packaging, or release-script change must leave the repository with a new installable version unless the user explicitly requests a local-only experiment or says not to release. A documentation-only or file-organization-only change that does not alter executable inputs, packaging, or published metadata does not allocate a version or trigger a release.

1. Root `package.json` is the single shared `versionName` authority. Choose a new unused stable semantic version and pass it explicitly to the release command; never recreate or move an existing tag.
2. Android `packaging/android/version-code.json` increments exactly once per intended Android build. Reuse that allocated code only when retrying the same failed build.
3. A future iOS client must add a tracked monotonically increasing build-number authority under `packaging/ios/` before its first installable build. Never derive or silently reuse it from Android `versionCode`.
4. Before desktop publication, run the gates in `docs/release/RELEASE_PROCESS.md` without `--skip-checks`.
5. Publish desktop code and artifacts from `main` with `pnpm release <new-version>`. If checks fail before tag creation, fix and rerun the same version. Use `pnpm release --resume vX.Y.Z` only after a tag exists and push/workflow/publication was interrupted.
6. After the shared version is synchronized and desktop succeeds, generate Android test artifacts with `pnpm release:android -- --debug`; production signing requires the private signing environment.
7. Do not claim a client release until its artifact, version/build number, architecture, checksum, signature, and required workflow/device gates are verified. State external blockers explicitly.

One intended release uses one semantic version and one per-client build number. An older artifact path is never evidence for the current build.

## Documentation Rules

- Current, cross-client rules belong in `docs/product/`, `docs/architecture/`, `docs/development/`, or `docs/release/`.
- Current client-specific facts belong in `docs/clients/<client>/`.
- Dated investigations, completed proposals, one-off audits, and superseded evidence belong in `docs/archive/`.
- Update `docs/README.md` whenever adding, moving, or retiring a current document.
- Use relative links and run a repository-wide link/path check after moving documentation.
- Status documents must separate implemented behavior, verified evidence, and remaining acceptance work.

## Coding and Testing Conventions

Use two-space indentation for TypeScript, CSS, JSON, and Markdown; rely on `rustfmt` for Rust. React components use `PascalCase.tsx`, hooks use `useCamelCase.ts`, and other TypeScript modules use `camelCase.ts`. Rust modules/functions use `snake_case`; types use `PascalCase`. Keep Tauri commands narrow and typed. UI code must not execute arbitrary SQL or access unapproved filesystem paths.

Use Vitest for UI/state rules, Rust tests for playback/library rules, and Playwright for critical shared flows. Name TypeScript tests `*.test.ts(x)`. Every filesystem test must prove source audio remains byte-identical. Cover damaged files, permission loss, rescans, queue recovery, and play-count thresholds.

## Commits, Security, and Local-First Rules

Use Conventional Commits and keep commits focused. Pull requests explain behavior changes, link the relevant current plan or issue, list verification commands, and include screenshots for UI changes. Call out migrations, permission changes, signing changes, and source-file write risk.

Treat music directories as read-only. Store ratings, playlists, statistics, downloaded lyrics, and artwork caches in application-managed storage. Online lyric lookup must be opt-in, disclose transmitted metadata, and fail without interrupting playback. Never commit credentials, signing keys, personal media, local SDK paths, or generated artifacts.
