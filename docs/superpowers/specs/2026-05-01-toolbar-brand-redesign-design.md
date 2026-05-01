# Toolbar Brand Redesign — Design Spec

**Date**: 2026-05-01
**Status**: Approved (awaiting implementation plan)
**Scope**: `src/components/Toolbar.tsx`, `src/components/ProjectChip.tsx`, plus a new `BrandMark` component

## Problem

Toolbar Zone A (Brand cluster) currently shows four independent visual elements crammed into 30 px:

```
┌─────────┐ ┌──┐ ┌────────┐
│ Erythos │ │● │ │ Demo ▾ │
│ v0.1.15…│ └──┘ └────────┘
└─────────┘
  brand     dot    chip
  column
```

The brand column has its own background (`#232638`) different from the rest of the toolbar (`var(--bg-header)` = `#292d3f`), creating a visual "pillar" that segments itself out. The version string (`v0.1.15a-016eb9cf`, 16 chars) is illegible at 8 px and competes with the wordmark above it. The autosave dot floats with no visual relationship to anything. The result feels cluttered, awkwardly arranged, and lacks brand identity — the wordmark "Erythos" in `--accent-blue` mono reads utilitarian, not branded.

User feedback (verbatim): "排版奇怪，雜，也缺乏品牌感".

## Design

Collapse Zone A from 4 visible elements to 2: a single brand mark and a project chip with the autosave dot integrated.

```
┌──┐ ┌────────────┐
│E ▒│ │● Demo   ▾ │
└──┘ └────────────┘
 mark    chip
```

### D1 — Brand Mark (new component)

Replace the entire vertical brand column with a single `BrandMark` component.

- **Dimensions**: 18×18 px square with `var(--radius-sm)` (2 px) corners.
- **Background**: linear gradient, 135°, from `var(--accent-purple)` (`#7a5fb0`) to `var(--accent-blue)` (`#527fc8`). Mirrors the "Twilight persona" theme name.
- **Letter**: capital "E", `var(--font-family)` (system-ui), `font-weight: 700`, 11 px, `var(--text-primary)` (`#e8eaf1`), no letter-spacing.
- **Cursor**: `pointer`. Mark is interactive (see D3).
- **Hover**: subtle brightness lift (e.g., `filter: brightness(1.12)`).
- **Active / dropdown-open**: 1 px outline using `var(--accent-gold)` (the focus accent), inset by -1 px to avoid layout shift. Matches existing project-chip "open" treatment in spirit.
- **Title attribute**: `Erythos v{__APP_VERSION__}` for hover hint without opening popover.

### D2 — ProjectChip changes

Move the autosave indicator from a standalone toolbar-level dot into the chip itself.

- New chip layout: `[autosave dot] [project name] [▾]`.
- Autosave dot: 5 px circle, color sourced from existing `autosaveDotColor()` logic (`accent-red` / `accent-gold` / `accent-green`), placed left of the project name with 6 px gap.
- Tooltip moves with the dot — chip's `title` attribute now reflects autosave status (e.g., `Autosave: saved`). Existing dot's standalone tooltip wrapper is removed.
- Chip dimensions, dropdown structure, and existing dropdown content (Recent Projects + Close Project) are unchanged. Version info does NOT move into the chip dropdown.
- The standalone `data-devid="toolbar-autosave-dot"` element in `Toolbar.tsx` is deleted entirely.

### D3 — Mark click → About popover

Clicking the brand mark opens a small "About" popover anchored beneath it.

- **Trigger**: click `BrandMark` button. Click again or click outside or Esc → close. (Reuse the close pattern from `ProjectChip`: `setTimeout(0)` before attaching `click` listener, plus `keydown` for Esc.)
- **Anchor**: `Portal` rendered at `position: fixed`, `top = mark.bottom + 2`, `left = mark.left`. Same offset pattern as `ProjectChip` dropdown.
- **Width**: ~280 px.
- **Visual**: `var(--bg-panel)` background, `1px solid var(--border-medium)`, `var(--radius-md)`, `var(--shadow-popup)`. Matches `ProjectChip` dropdown.
- **Content** (minimal, decision Q3 = a):
  - Line 1: "Erythos" — primary text, system-ui 13 px, `--text-primary`.
  - Line 2: `v{__APP_VERSION__}` — `--font-mono`, 11 px, `--text-muted`.
  - Padding: 12 px 14 px.
- No tagline, no external links, no actions in v1. The popover exists primarily so the version string has a home now that it's removed from the toolbar.

### D4 — Toolbar structural cleanup

- Delete `data-devid="toolbar-brand"` (the vertical-column wrapper with `#232638` background and right border).
- Delete `data-devid="toolbar-autosave-dot"` (now subsumed into chip).
- Toolbar root keeps `var(--bg-header)` uniformly across the brand area.
- Add `padding-left: 8 px` on the toolbar root so the mark doesn't sit flush against the left edge.
- Mark + chip section gap: 8 px (via `gap` on the toolbar flex container, or `margin-left` on the chip wrapper — implementation choice).
- `data-devid` map after the change:
  - `toolbar` (root) — unchanged
  - `toolbar-brand-mark` (new) — wraps the BrandMark button
  - `toolbar-project` — unchanged wrapper around `ProjectChip`
  - `toolbar-workspace-tabs` — unchanged
  - `toolbar-reset-layout` — unchanged
- Workspace tabs, spacer, divider, Reset Layout button, ghost "+" — all untouched.

## Component contract

### `BrandMark` component (new file: `src/components/BrandMark.tsx`)

```ts
interface Props {
  appVersion: string;          // e.g., "0.1.15a-016eb9cf" (without leading "v")
}
```

- Renders an 18×18 button (mark) plus a Portal popover when open.
- Owns its own `open` signal and dropdown position calculation (same pattern as `ProjectChip`).
- Named export: `export { BrandMark }`.
- Uses `createSignal` for open/hover state, `createEffect + onCleanup` for Esc and click-outside listeners (per components/CLAUDE.md convention).

### `ProjectChip` props change

No public API change. `autosaveStatus` is already a prop; the component now renders the autosave dot internally and sets a chip-level `title="Autosave: <status>"` that replaces the deleted `toolbar-autosave-dot` wrapper's tooltip.

### `Toolbar.tsx` change shape

- Replace `toolbar-brand` block (lines ~36–75) with `<BrandMark appVersion={__APP_VERSION__} />` wrapped in a `data-devid="toolbar-brand-mark"` wrapper.
- Delete `toolbar-autosave-dot` block (lines ~77–92).
- Delete the `autosaveDotColor()` function from `Toolbar.tsx` — logic moves to `ProjectChip` (or shared helper if needed elsewhere).
- Keep `bridge.autosaveStatus()` flowing through to `ProjectChip` (already happens via existing prop).

## Behavior details

- **Version string source**: `__APP_VERSION__` Vite-injected constant, unchanged.
- **Autosave dot color logic**: identical mapping (`error → red`, `pending → gold`, `saved/idle → green`). Moved verbatim into `ProjectChip` or a shared util — implementation choice for the plan, not the spec.
- **Esc / click-outside concurrency**: BrandMark popover and ProjectChip dropdown both listen for Esc and document clicks. Each component scopes its own listener via `createEffect(() => { if (!open()) return; ... })`. Opening one does not auto-close the other (acceptable: editors like Figma allow stacked menus). If usability shows this is confusing, follow up — not in scope for v1.
- **`data-devid` consistency** (per `src/components/CLAUDE.md` horizontal-group rule): `toolbar-brand-mark`, `toolbar-project`, `toolbar-workspace-tabs`, `toolbar-reset-layout` are the toolbar's direct children. Each has its own wrapper with a `data-devid`. No anonymous wrapper around any of them.

## Out of scope

- Workspace tab styling (Zone B) — user explicitly limited scope to A.
- Reset Layout button styling (Zone C) — same.
- ProjectChip dropdown content layout (Recent Projects, Close Project) — unchanged.
- Adding About popover content beyond app name + version — explicit Q3 = (a).
- Theme-level color changes — using existing tokens only.
- Renaming or restyling existing data-devid identifiers other than the deletions/additions listed above.
- Animation polish (mark hover, popover open/close transitions) — keep `var(--transition-fast)` on color/background, no entry/exit animations beyond what already exists.

## Acceptance

- Visual: toolbar left side renders mark + chip with no separate brand column or floating dot.
- Mark click opens a popover anchored below it, showing "Erythos" + version, dismissed by Esc / click-outside / re-click.
- Chip shows autosave dot inside, color-cycling through saved/pending/error states identically to today's standalone dot.
- No `toolbar-brand` or `toolbar-autosave-dot` `data-devid` remains in the DOM.
- `npm run build` passes (TypeScript strict).
- No regression to workspace tabs, ghost "+", divider, or Reset Layout.

## Open follow-ups (post-merge)

- Consider whether mark + ProjectChip should be siblings under a single `toolbar-identity` wrapper (semantic grouping). Currently treated as flat siblings to keep the change small.
- Tagline / GitHub link in About popover — defer until there's a reason.
- About popover keyboard nav — if it ever grows interactive content.
