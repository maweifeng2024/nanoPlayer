# nanoPlayer visual baseline

Updated: 2026-09-05

This document freezes the current first-version visual decisions so implementation work does not accidentally replace the approved interface with a generic light player layout.

## Reference artifacts

- `nanoplayer-netease-inspired-home-v2.png`: primary desktop composition and spacing reference.
- `nanoplayer-netease-inspired-home-v1.png`: text-only sidebar wordmark reference.
- `nanoplayer-app-icon-v1.png`: editable application-icon source of truth.
- `../../test-results/nanoplayer-designed-home.png`: latest implemented desktop screenshot.
- `../../test-results/nanoplayer-720.png`: latest 720 px responsive screenshot with the navigation overlay open.

Reference images communicate direction, not hard-coded content. Current product features and accessible controls take precedence when a reference omits a newer capability.

## Visual rules

- Default to the dark red/black theme: near-black surfaces, restrained borders, low-saturation secondary text, and coral red only for playback, selection, and primary actions.
- Keep the fixed application frame: sidebar, independently scrolling content, fixed player bar, and optional right drawer.
- Use the large cover-led home hero, three title-only recommendation lists, and a dense music table. Avoid bright page-wide backgrounds, oversized shadows, or unrelated gradients.
- Preserve the 720, 900, and desktop responsive paths. At narrow widths the sidebar becomes an overlay and the player retains the primary transport controls.
- System and light themes remain user choices, but they are not the release screenshot baseline.

## macOS title bar and wordmark

- The window uses Tauri `titleBarStyle: Overlay` with a hidden system title.
- Reserve 64 px at the top of the desktop sidebar for the close/minimize/zoom traffic lights.
- The sidebar wordmark is text-only: red `nano` plus white `Player`. Do not place the full application icon beside it.
- The responsive overlay keeps the same top safe area because macOS traffic lights remain present at the minimum window width.
- If a compact mark is reconsidered later, it must be visually simpler than the application icon, no larger than 18 px, and remain outside the traffic-light hit area.

## Application icon

The application icon belongs to Finder, Dock, installers, application metadata, the website/favicon, and empty-artwork fallbacks—not the sidebar title.

Generate platform files only from `nanoplayer-app-icon-v1.png`:

```bash
pnpm tauri icon docs/design/nanoplayer-app-icon-v1.png
```

The Tauri `bundle.icon` list is mandatory. A successful release check requires both `CFBundleIconFile=icon.icns` and a non-empty `Contents/Resources/icon.icns` in the built `.app`.

## Theme migration

Visual design version 2 changes the new-install default from `system` to `dark`. Existing state without this design version is migrated once to dark so the approved interface is visible after upgrade. After migration, explicit user choices for system, light, or dark persist normally.

## Regression checklist

1. Compare the desktop home screen with `nanoplayer-netease-inspired-home-v2.png`.
2. Confirm the sidebar contains no image inside `.brand` and the wordmark clears the traffic lights.
3. Check desktop and 720 px screenshots for clipping, overlay completion, player visibility, and usable search.
4. Run `pnpm check` and `pnpm test:e2e`; the first Playwright flow asserts the dark default and text-only wordmark.
5. Build `pnpm tauri build --debug --bundles app`, open the generated app, and inspect the native accessibility tree and bundle icon metadata.

## September 5 UI refinement

- Preserve the dark default and coral brand; use graphite content surfaces and quieter selection fills instead of broad red gradients.
- Light mode uses warm white surfaces with shared text, input, hover and selection tokens, including dialogs, lyrics, queues and menus.
- Search from any page opens song results, with a clear button and Escape to clear and blur.
- Focused buttons retain native Space activation; global playback Space does not override dialog controls.
- Keep the queue button visible at 720–900 px; volume controls remain available at desktop width. Clicking outside the narrow navigation closes it.
- Keyboard focus reveals slider thumbs and queue removal actions; honor reduced-motion preferences.
- Validation: 14 unit tests and 15 Chrome E2E flows passed. Screenshots live in `test-results/ui-polish-{dark,light,720}.png` and `test-results/ui-polish-light-settings.png`. Browser checks do not establish native audio behavior.

### Large-library navigation regression

Song rows now start with a bounded first render instead of mounting the entire library before virtualization. Album and artist groups are built in one pass, and their grids render only visible rows plus overscan. Artist portraits stop scanning after four distinct available album covers.

The 10,000-track synthetic Chrome regression checks bounded row/card counts, navigation, scrolling to the last collection, opening its details and returning. Observed click-to-heading times on this machine: songs 144 ms, albums 49 ms, artists 29 ms (includes Playwright overhead; synthetic metadata without artwork, not native playback latency). The original 15 E2E flows and 14 unit tests also pass. Release and debug application bundles both include the fix.
