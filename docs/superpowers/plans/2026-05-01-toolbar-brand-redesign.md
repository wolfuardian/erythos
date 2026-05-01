# Toolbar Brand Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4-element toolbar brand cluster (Erythos wordmark + version string + standalone autosave dot + ProjectChip) with a 2-element design: a Twilight-gradient `BrandMark` (with a small click-to-open About popover) plus a `ProjectChip` that absorbs the autosave dot internally.

**Architecture:** New `BrandMark.tsx` component owns its own button + Portal popover (mirroring `ProjectChip`'s open/Esc/click-outside pattern). `ProjectChip.tsx` renders the autosave dot inside its button. `Toolbar.tsx` deletes the old `toolbar-brand` vertical column and the standalone `toolbar-autosave-dot`, then mounts `<BrandMark>` directly. No changes to workspace tabs, the divider, the Reset Layout button, or the ProjectChip dropdown contents.

**Tech Stack:** SolidJS (`createSignal`, `createEffect`, `onCleanup`, `Portal`, `Show`), TypeScript strict, theme tokens from `src/styles/theme.css`. No new dependencies. Verification via `npm run build` plus manual visual check on the dev server.

**Spec:** `docs/superpowers/specs/2026-05-01-toolbar-brand-redesign-design.md`

**Project conventions (read before starting):**

- `src/components/CLAUDE.md` — module scope, named export rule, `data-devid` horizontal-group consistency
- Existing `src/components/ProjectChip.tsx` — reference pattern for button + Portal popover + Esc/click-outside/setTimeout(0) bootstrap
- Existing `src/styles/theme.css` — color and spacing tokens

**File structure after change:**

| File | Status | Responsibility |
|------|--------|---------------|
| `src/components/BrandMark.tsx` | **Create** | 18×18 brand mark button + About popover |
| `src/components/ProjectChip.tsx` | **Modify** | Render autosave dot inside chip; update chip title attribute |
| `src/components/Toolbar.tsx` | **Modify** | Delete brand column block, delete standalone autosave dot, mount `<BrandMark>` |

No other files in the project need to change.

**Convention notes:**

- This project's `src/components/` has no unit tests and the convention is to verify component changes via `npm run build` (TypeScript strict) plus manual visual inspection on `npm run dev`. The TDD steps prescribed by the writing-plans skill are adapted here: each task implements the change, runs `npm run build`, then commits. The final task is a manual visual verification checklist on the dev server.

---

## Task 1: Create `BrandMark` component

**Files:**
- Create: `src/components/BrandMark.tsx`

- [ ] **Step 1: Create the file with full content**

Create `src/components/BrandMark.tsx` with the content below. The component is a self-contained button + Portal popover. It is not yet wired into `Toolbar.tsx` — that happens in Task 3.

```tsx
import { type Component, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';

interface Props {
  /** App version string without leading "v", e.g. "0.1.15a-016eb9cf". */
  appVersion: string;
}

const BrandMark: Component<Props> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);
  const [popoverPos, setPopoverPos] = createSignal<{ top: number; left: number }>({ top: 0, left: 0 });

  let buttonRef: HTMLButtonElement | undefined;
  let popoverRef: HTMLDivElement | undefined;

  // Esc closes popover
  createEffect(() => {
    if (!open()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  // Click-outside closes popover (deferred to avoid closing on the opening click)
  createEffect(() => {
    if (!open()) return;
    const timer = setTimeout(() => {
      const onDocClick = (e: MouseEvent) => {
        if (buttonRef && buttonRef.contains(e.target as Node)) return;
        if (popoverRef && popoverRef.contains(e.target as Node)) return;
        setOpen(false);
      };
      document.addEventListener('click', onDocClick);
      onCleanup(() => document.removeEventListener('click', onDocClick));
    }, 0);
    onCleanup(() => clearTimeout(timer));
  });

  const handleClick = () => {
    if (!open() && buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 2, left: rect.left });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        data-devid="brand-mark"
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={`Erythos v${props.appVersion}`}
        style={{
          width: '18px',
          height: '18px',
          background: 'linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-blue) 100%)',
          'border-radius': 'var(--radius-sm)',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          color: 'var(--text-primary)',
          'font-family': 'var(--font-family)',
          'font-weight': '700',
          'font-size': '11px',
          'line-height': '1',
          padding: '0',
          border: 'none',
          cursor: 'pointer',
          'flex-shrink': '0',
          outline: open() ? '1px solid var(--accent-gold)' : 'none',
          'outline-offset': '-1px',
          filter: hovered() && !open() ? 'brightness(1.12)' : 'none',
          transition: 'filter var(--transition-fast)',
        }}
      >
        E
      </button>

      <Show when={open()}>
        <Portal>
          <div
            data-devid="brand-mark-about"
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: `${popoverPos().top}px`,
              left: `${popoverPos().left}px`,
              'z-index': '900',
              width: '280px',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-medium)',
              'border-radius': 'var(--radius-md)',
              'box-shadow': 'var(--shadow-popup)',
              padding: '12px 14px',
              display: 'flex',
              'flex-direction': 'column',
              gap: '4px',
            }}
          >
            <div
              data-devid="brand-mark-about-name"
              style={{
                'font-family': 'var(--font-family)',
                'font-size': '13px',
                color: 'var(--text-primary)',
                'line-height': '1',
              }}
            >
              Erythos
            </div>
            <div
              data-devid="brand-mark-about-version"
              style={{
                'font-family': 'var(--font-mono)',
                'font-size': '11px',
                color: 'var(--text-muted)',
                'line-height': '1',
              }}
            >
              v{props.appVersion}
            </div>
          </div>
        </Portal>
      </Show>
    </>
  );
};

export { BrandMark };
```

- [ ] **Step 2: Verify TypeScript compile**

Run: `npm run build`
Expected: PASS (the new file is not yet imported anywhere — it should compile cleanly).

- [ ] **Step 3: Commit**

```bash
git add src/components/BrandMark.tsx
git commit -m "[components] add BrandMark component (refs spec 2026-05-01-toolbar-brand-redesign)"
```

---

## Task 2: Render autosave dot inside `ProjectChip`

**Files:**
- Modify: `src/components/ProjectChip.tsx`

The chip currently receives `autosaveStatus` as a prop but does not render any dot — the dot is rendered by `Toolbar.tsx` as a sibling. After this task, the chip renders the dot internally; the `Toolbar.tsx` standalone dot is still present (it is removed in Task 3). For one commit, two dots will appear in the toolbar — this is intentional and resolved in the next task.

- [ ] **Step 1: Add an internal autosave-color helper above the component**

In `src/components/ProjectChip.tsx`, after the existing `relativeTime` helper (around line 37) and before `const ProjectChip: Component<Props> = (props) => {`, add:

```tsx
function autosaveDotColor(status: 'idle' | 'pending' | 'saved' | 'error'): string {
  if (status === 'error') return 'var(--accent-red)';
  if (status === 'pending') return 'var(--accent-gold)';
  return 'var(--accent-green)'; // 'saved' | 'idle'
}
```

- [ ] **Step 2: Add `title` attribute to the chip button**

Find the chip `<button>` element (around line 157, the one with `data-devid="project-chip"`). Add a `title` attribute right after `onMouseLeave`:

```tsx
        onMouseLeave={() => setHovered(false)}
        title={`Autosave: ${props.autosaveStatus}`}
```

- [ ] **Step 3: Render the autosave dot before the project name span**

Inside the same `<button>`, the current children are a `<span>` with the project name and a `<span>` with `▾`. Insert a new `<span>` for the dot **before** the project-name span. Replace this block:

```tsx
        <span style={{ flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
          {props.projectName}
        </span>
        <span style={{ 'flex-shrink': '0' }}>▾</span>
```

with:

```tsx
        <span
          data-devid="project-chip-autosave-dot"
          style={{
            display: 'inline-block',
            width: '5px',
            height: '5px',
            'border-radius': '50%',
            background: autosaveDotColor(props.autosaveStatus),
            'flex-shrink': '0',
          }}
        />
        <span style={{ flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
          {props.projectName}
        </span>
        <span style={{ 'flex-shrink': '0' }}>▾</span>
```

- [ ] **Step 4: Adjust the chip's flex `gap` so the dot, name, and chevron breathe correctly**

The chip button currently has `gap: '4px'` (around line 167). Change it to `gap: '6px'` to match the spec's "6 px between dot and project name":

```tsx
          gap: '6px',
```

- [ ] **Step 5: Verify TypeScript compile**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProjectChip.tsx
git commit -m "[components] integrate autosave dot into ProjectChip (refs spec 2026-05-01-toolbar-brand-redesign)"
```

---

## Task 3: Wire `BrandMark` into `Toolbar` and remove old brand cluster elements

**Files:**
- Modify: `src/components/Toolbar.tsx`

This task replaces the vertical "Erythos / version" brand column with `<BrandMark>`, deletes the standalone autosave dot (now inside the chip), removes the now-unused `autosaveDotColor` helper, and adjusts toolbar root padding/gap.

- [ ] **Step 1: Add the `BrandMark` import**

At the top of `src/components/Toolbar.tsx`, alongside the existing imports, add:

```tsx
import { BrandMark } from './BrandMark';
```

- [ ] **Step 2: Delete the unused `autosaveDotColor` helper**

Inside the `Toolbar` component, delete this block (currently around lines 13–18):

```tsx
  // Autosave dot color
  const autosaveDotColor = () => {
    const s = bridge.autosaveStatus();
    if (s === 'error') return 'var(--accent-red)';
    if (s === 'pending') return 'var(--accent-gold)';
    return 'var(--accent-green)'; // 'saved' | 'idle'
  };
```

- [ ] **Step 3: Replace the brand column block with `<BrandMark>` wrapper**

Find the `data-devid="toolbar-brand"` block (currently around lines 36–75 — a `<div>` containing two `<span>`s for "Erythos" and `v{__APP_VERSION__}`). Replace the entire block with:

```tsx
      {/* Brand mark */}
      <div
        data-devid="toolbar-brand-mark"
        style={{ display: 'flex', 'align-items': 'center', 'flex-shrink': '0' }}
      >
        <BrandMark appVersion={__APP_VERSION__} />
      </div>
```

- [ ] **Step 4: Delete the standalone `toolbar-autosave-dot` block**

Find and delete the entire `data-devid="toolbar-autosave-dot"` block (currently around lines 77–92 — the `<div>` wrapper containing a `<div>` for the colored dot, with `title={...}` referring to `bridge.autosaveStatus()`).

- [ ] **Step 5: Add toolbar-level left padding**

The toolbar root `<div data-devid="toolbar">` currently has no horizontal padding (the deleted brand column had its own internal padding). Add `padding-left: '8px'` to the toolbar root style block so the mark doesn't sit flush against the left edge.

In the toolbar root style object (currently `height: '30px'`, `background: 'var(--bg-header)'`, etc.), add the new property next to `overflow: 'hidden'`:

```tsx
        'padding-left': '8px',
```

Leave the existing `data-devid="toolbar-project"` `padding: '0 7px'` unchanged — its 7 px of left padding combined with the mark wrapper's flush-right edge produces a ~7 px gap between the mark and the chip, which matches the spec's "~8 px" intent within rounding.

- [ ] **Step 6: Verify TypeScript compile**

Run: `npm run build`
Expected: PASS. No "unused variable" or "undefined identifier" errors. The DOM tree should now have `toolbar > toolbar-brand-mark > brand-mark` plus `toolbar-project > project-chip` (with `project-chip-autosave-dot` inside) plus the unchanged tabs/divider/reset.

- [ ] **Step 7: Commit**

```bash
git add src/components/Toolbar.tsx
git commit -m "[components] wire BrandMark into Toolbar, remove old brand column and standalone autosave dot (refs spec 2026-05-01-toolbar-brand-redesign)"
```

---

## Task 4: Manual visual verification on the dev server

**Files:** none modified.

This task is a checklist run against `npm run dev`. There are no automated component tests for this module — verification is visual.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the URL printed by Vite (typically `http://localhost:5173`).

- [ ] **Step 2: Verify the toolbar layout**

Confirm visually:

- Left edge of toolbar: 18×18 purple→blue gradient square with a white "E" letter.
- 8 px breathing room between the mark and the project chip.
- Project chip shows: small green dot (autosave saved), then "Demo" (or whatever the current project is), then a "▾" chevron.
- No standalone green dot floating between the mark and the chip.
- No vertical "Erythos / version" text column.
- Workspace tabs and the Reset (↺) button still render the same as before.

- [ ] **Step 3: Verify mark interactivity**

- Hover the mark → subtle brightness lift.
- Click the mark → an About popover opens beneath it, showing "Erythos" and `v{version}` on two lines.
- The mark has a 1 px gold outline while the popover is open.
- Press Esc → the popover closes.
- Click the mark again to open it. Click anywhere outside the popover → it closes.

- [ ] **Step 4: Verify autosave dot color states**

The dot color is driven by `bridge.autosaveStatus()`. Trigger each state and confirm the dot color in the chip:

- `saved` / `idle` → green (`--accent-green`).
- `pending` → gold (`--accent-gold`). Triggered briefly during a save; the project must be in a saving state. If hard to capture visually, hover the chip and confirm the `title` attribute reads `Autosave: pending` while saving (use DevTools to inspect during a save).
- `error` → red (`--accent-red`). Hardest to trigger naturally — acceptable to defer this verification to organic future testing if no error-injection path exists in the running app.

- [ ] **Step 5: Verify no regressions to other toolbar elements**

- Workspace tabs: clicking switches workspaces; ghost "+" still adds a new workspace.
- Reset Layout (↺): clicking still triggers the layout reset + reload.
- `data-devid` audit (in DevTools): the toolbar's direct children are exactly `toolbar-brand-mark`, `toolbar-project`, `toolbar-workspace-tabs`, `toolbar-reset-layout` (with the divider in between). No `toolbar-brand` or `toolbar-autosave-dot` remain.

- [ ] **Step 6: If any issue is found, file as a follow-up commit on the same branch**

If a regression is spotted, fix it on the same branch as a follow-up commit. Do not amend prior commits.

---

## Self-review against the spec

| Spec section | Covered by |
|--------------|------------|
| D1 — Brand Mark dimensions, gradient, letter, hover, active outline, title | Task 1 (full file) |
| D2 — Autosave dot moved inside chip, color logic, title attribute, standalone dot deleted | Tasks 2 + 3 |
| D3 — Mark click → About popover (Erythos + version, Esc + click-outside dismiss, Portal anchor) | Task 1 (full file) |
| D4 — Brand column wrapper deleted, toolbar uniform `--bg-header`, padding-left 8 px, mark+chip gap | Task 3 |
| Acceptance: `npm run build` passes | Each task ends with build check |
| Acceptance: no `toolbar-brand` / `toolbar-autosave-dot` data-devid remains | Task 3 + Task 4 step 5 audit |
| Acceptance: visual states verified | Task 4 |
| Out of scope: workspace tabs, Reset, dropdown content | Tasks touch only the scoped files; verified in Task 4 step 5 |

No placeholders, no "TBD", no references to undefined types. All file paths are absolute within the repo.
