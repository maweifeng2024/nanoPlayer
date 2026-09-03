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

## Coding Style & Naming Conventions

Use two-space indentation for TypeScript, CSS, JSON, and Markdown; rely on `rustfmt` for Rust. React components use `PascalCase.tsx`, hooks use `useCamelCase.ts`, and other TypeScript modules use `camelCase.ts`. Rust modules and functions use `snake_case`; types use `PascalCase`. Keep Tauri commands narrow and typed. UI code must not execute arbitrary SQL or access unapproved filesystem paths.

## Testing Guidelines

Use Vitest for UI and state logic, Rust tests for playback/library rules, and Playwright for critical desktop flows. Name TypeScript tests `*.test.ts(x)` and Rust integration tests by behavior, such as `tests/library_scan.rs`. Every filesystem test must prove source audio remains byte-identical. Cover damaged files, permission loss, rescans, queue recovery, and play-count thresholds.

## Commit & Pull Request Guidelines

There is no Git history yet. Use Conventional Commits, for example `feat(library): add folder rescan`. Keep commits focused. Pull requests must explain behavior changes, link the relevant plan section or issue, list verification commands, and include screenshots for UI changes. Call out database migrations, permission changes, and any source-file write risk explicitly.

## Security & Local-First Rules

Treat music directories as read-only. Store ratings, playlists, statistics, downloaded lyrics, and artwork caches in application-managed storage. Online lyric lookup must be opt-in, disclose transmitted metadata, and fail without interrupting playback.
