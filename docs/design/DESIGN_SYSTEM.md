# nanoPlayer visual baseline

Updated: 2026-09-22 (documentation organization only; visual rules unchanged)

This document freezes the current first-version visual decisions so implementation work does not accidentally replace the approved interface with a generic light player layout.

## Reference artifacts

- `nanoplayer-app-icon-v3.png`: editable application-icon source of truth.
- `baseline/desktop-dark.png`: durable dark desktop reference.
- `baseline/desktop-light.png`: durable light desktop reference.
- `baseline/desktop-720.png`: durable narrow-desktop reference.
- `baseline/phone-360.png`, `baseline/pad-600.png`, `baseline/pad-1024.png`: durable mobile layout references.

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

Generate platform files only from `nanoplayer-app-icon-v3.png`:

```bash
pnpm tauri icon docs/design/nanoplayer-app-icon-v3.png
```

The Tauri `bundle.icon` list is mandatory. A successful release check requires both `CFBundleIconFile=icon.icns` and a non-empty `Contents/Resources/icon.icns` in the built `.app`.

## Theme migration

Visual design version 2 changes the new-install default from `system` to `dark`. Existing state without this design version is migrated once to dark so the approved interface is visible after upgrade. After migration, explicit user choices for system, light, or dark persist normally.

## Regression checklist

1. Compare the desktop and mobile layouts with the durable images under `baseline/`.
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

## Current implementation clarification (2026-09-11)

Home artwork follows the selected welcome track, uses bundled SVG scenes when missing, aligns with the lists and has no hero shadow. Returning home remounts its contextual selection. The UI includes Chinese/English and cover-derived ambient coloring in dark/light modes. Current browser validation is 27 passing E2E flows; older counts/timings above are dated historical evidence, not current gates. The current captured product image is `website/public/product-home-current.png` (2026-09-06); generated `test-results/` images are local, not durable design masters.

Android phone and Pad reuse the shared design system with touch, safe-area, and split-screen adaptations. Physical-device acceptance remains incomplete; see [Android status](../clients/android/STATUS.md). iOS/iPadOS is not implemented.

## Android inheritance clarification (2026-09-16, user confirmed)

Phone and Pad share the existing desktop styles, colors, typography, icons, theme and control states; phone layout redesign does not authorize a separate visual system. Pad must also preserve desktop feature structure, every menu's order and interaction semantics. Mobile incompatibilities require a concrete proposal and user decision before changing them. The prior suggestion to switch a narrow Pad to phone navigation is withdrawn. See `../clients/android/PLAN.md` revision 2 for source mappings and pending platform exceptions.

### Approved Android exceptions (revision 3)

P1: hide the persistent sidebar in narrow split view and scroll content, retaining navigation access and menu order. P2: long press opens the same More/context menu; scrolling cancels it. P3: enlarge text and buttons for touch while preserving visual consistency, using mobile size overrides rather than changing desktop tokens. P4: remove desktop-only window behavior and use Android safe areas. P5: preserve feature placement while mapping output, updates and folder access to Android system routing, APK/store updates and SAF. These exceptions are implemented in the Android client; remaining acceptance is tracked in its status document.

## September 19 shared UI refactor

The user confirmed retaining navigation while improving existing screens. Desktop body/caption/micro text now uses 14/13/11 px; Android retains 16 px body and 14 px caption text. Spacing and radii use shared tokens, with explicit exceptions for layout geometry. Phone and Pad use real 48 px icon targets. Desktop widths below 720 px use compact controls without changing the native minimum window size.

Home lists grow with their contents and use the page scroller. All themes have a stable frame color; artwork-derived colors fade to that same color at content boundaries. Placeholder artwork retains the previous real cover's palette. Button pressed states remain visible in both themes.

Current evidence and limitations are recorded in the [Android status](../clients/android/STATUS.md). The dated shared-UI implementation report is archived at [`../archive/ui/UI_REFACTOR_2026-09-19.md`](../archive/ui/UI_REFACTOR_2026-09-19.md). Reproducible Chrome screenshots are in `tests/e2e/ui-visual.spec.ts-snapshots/`; the six durable references are in `docs/design/baseline/`. Native Android queue replay/shuffle is covered by emulator instrumentation; this is not physical-device acceptance.
