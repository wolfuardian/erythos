# Styles Convention

This document defines how styles are written and organised in Erythos.

## Default: CSS Modules, colocated

Every component gets its own CSS Module file placed in the same directory as the component source:

```
src/components/
  ConfirmDialog.tsx
  ConfirmDialog.module.css   ← colocated
src/panels/scene-tree/
  SceneTreePanel.tsx
  SceneTreePanel.module.css  ← colocated
```

Import with:

```ts
import styles from './ConfirmDialog.module.css';
```

Use in JSX with:

```tsx
<div class={styles.overlay}>
```

Vite is configured with `localsConvention: 'camelCase'`, so CSS class `.confirmButton` is accessed as `styles.confirmButton`.

The scoped name format in development is `[name]__[local]__[hash:base64:4]` (e.g. `ConfirmDialog__overlay__3f2a`), making classes easy to inspect in DevTools. Production builds use short hashes (`[hash:base64:6]`).

---

## When inline style is allowed

Inline styles are permitted in exactly three situations. Each site must carry a `// inline-allowed: <reason>` comment.

### 1. Per-frame drag/resize coordinates

When a value changes every animation frame via pointer move events, CSS classes cannot keep up without causing layout thrash. Use inline style for the raw numeric position.

Example (`AreaSplitter.tsx`):

```tsx
// inline-allowed: per-frame drag coordinates updated on pointermove
<div style={{ left: `${pos()}px`, top: '0', width: '4px', height: '100%' }} />
```

Applicable values: `left`, `top`, `width`, `height` driven by `pointermove`.

### 2. Computed geometric offsets

When a value is derived from a runtime measurement (e.g. element height read via `getBoundingClientRect`) and combined with a formula, it cannot be expressed as a static CSS value.

Example (`LadderOverlay.tsx`):

```tsx
// inline-allowed: offset derived from measured tier stack height at runtime
<div style={{ transform: `translate(-50%, -${tierStackHeight() / 2}px)` }} />
```

### 3. CSS variable injection for dynamic numeric values

When a single numeric signal drives a CSS property that is reused in multiple selectors, inject it as a custom property and consume it in the module CSS.

```tsx
// inline-allowed: CSS variable injection — numeric value consumed by CSS
<div style={{ '--progress': progress() + '%' }}>
```

```css
/* in the module CSS */
.bar {
  width: var(--progress);
}
```

This keeps the CSS logic (layout, transitions) inside the stylesheet while only the raw number crosses the boundary.

---

## Hover and focus states

Do not mirror hover or focus state into JS signals just to swap a background colour or border. Use CSS pseudo-classes instead.

```css
/* correct */
.cancelButton:hover {
  background: var(--bg-hover);
}

/* also correct */
.input:focus-within {
  border-color: var(--accent-blue);
}
```

**Exception:** when the hover state drives JS logic (not just visual style), keep the signal but reflect it into a class:

```tsx
// hovered() is read by JS logic (e.g. showArrows = hovered() && !focused())
<div
  classList={{ [styles.showArrows]: hovered() && !focused() }}
  onMouseEnter={() => setHovered(true)}
  onMouseLeave={() => setHovered(false)}
/>
```

The rule is: if JS reads the value, a signal is fine. If the value only changes visual appearance, a signal is unnecessary.

---

## Dynamic class switching

Use `classList` to toggle classes based on reactive state:

```tsx
<button classList={{ [styles.active]: isActive(), [styles.danger]: isDanger() }} />
```

**Prohibited:** ternary string concatenation in `class`:

```tsx
// BAD — re-sets the entire class string on every render
<button class={isActive() ? styles.active : styles.base} />
```

Multiple static classes can be combined with a static `class` plus `classList` for the dynamic parts:

```tsx
<button class={styles.button} classList={{ [styles.cancelButton]: true }} />
```

Mixing `class` (static base) and `classList` (dynamic additions) is explicitly supported by SolidJS.

---

## Prohibited patterns

### Exported style objects from TS/JS

Do not export style objects from TypeScript files to share styles across components. This was the `fieldStyles.ts` pattern; it is retired.

```ts
// PROHIBITED
export const fieldStyles = {
  row: { display: 'flex', gap: '8px' },
};
```

Use a shared CSS Module instead if styles truly need to be shared. In most cases the element is simply a component — extract it.

### Direct element.style mutation

```ts
// PROHIBITED
element.style.background = 'var(--accent-blue)';
```

If the value must change reactively, use a signal bound to an inline style or a toggled class.

### BEM naming

CSS Modules hash the class names to prevent collisions, so BEM prefixes (`.ConfirmDialog__overlay--open`) add zero value and substantial noise. Use short, locally meaningful names (`.overlay`, `.open`).

### Utility class libraries

Do not introduce utility-class systems (Tailwind, UnoCSS, or hand-rolled equivalents). Writing three extra CSS declarations in a module file is not repetition that needs abstraction — utility classes are technical debt in a component-scoped styling model.

---

## CSS class naming

Classes use **camelCase** to match the `localsConvention: 'camelCase'` Vite setting.

Names should be locally semantic — describe the role of the element within the component, not the component name itself. The hash already provides scope isolation.

```css
/* correct — local role names */
.overlay { }
.dialog  { }
.title   { }
.actions { }
.button  { }
.cancelButton { }
.confirmButton { }
.danger  { }

/* unnecessary — the hash already isolates the scope */
.confirmDialogOverlay { }
.confirmDialogTitle   { }
```

Short names like `.row`, `.label`, `.input`, `.icon` are perfectly fine when they describe the element's purpose within their own module.
