# Architecture

This document describes Erythos' high-level architecture. For module-specific details, see the local `CLAUDE.md` (or equivalent) in each `src/*` folder.

## Layering

```
┌─────────────────────────────────────────────────────────┐
│                       app/                              │
│         editor shell · dockable layout · bridge         │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
               ▼                           ▼
       ┌──────────────┐            ┌──────────────┐
       │   panels/    │            │  viewport/   │
       │  Solid UI    │            │  Three.js    │
       └──────┬───────┘            └──────┬───────┘
              │                           │
              └─────────────┬─────────────┘
                            ▼
                     ┌──────────────┐
                     │    core/     │
                     │ domain model │
                     │ scene graph  │
                     │  project IO  │
                     └──────────────┘
```

- **`core/`** — pure domain. No DOM, no Solid, no Three. Holds the editor's source of truth, command queue, and project (de)serialisation.
- **`viewport/`** — owns the Three.js scene, camera, renderer, and gizmos. Reads from `core/`; never reads from `panels/`.
- **`panels/`** — Solid components, one per dockable panel. Reads state through the bridge; writes only through `Command` objects.
- **`app/`** — composition root. Wires `core ↔ panels ↔ viewport`, owns the layout, and houses the bridge that exposes `core` state as Solid signals.
- **`components/`** — cross-panel UI primitives (buttons, inputs, panel headers, etc.).
- **`styles/`** — design tokens for the Twilight theme.

## Three Invariants

These are enforced across the codebase. Violating them is grounds for revert.

### 1. Command pattern for all mutations

All scene mutations — adding objects, editing properties, reparenting, deleting — go through a `Command` and `editor.execute(cmd)`. This guarantees:

- A single, coherent undo / redo stack.
- A single audit point for events emitted after a mutation.
- Replayability and testability of complex flows.

Direct mutation of `core/` state outside a `Command` is a bug, even if it appears to "work".

### 2. Event ordering

The editor emits domain events in a specific order; the bridge translates them into signal updates; panels re-render in response.

```
Editor.execute(cmd)
  → core mutates
  → events emitted   ← stable order, e.g. objectAdded → sceneGraphChanged
  → bridge updates signals
  → panels re-render
```

Do not reverse `objectAdded` and `sceneGraphChanged`. Downstream code (especially the Scene Tree and Properties panels) relies on this order to avoid "ghost selection" and stale-render artifacts.

### 3. Module boundaries

| Module       | May depend on                          | Must not                                  |
| ------------ | -------------------------------------- | ----------------------------------------- |
| `core/`      | nothing UI                             | import from Solid, Three, panels, viewport |
| `viewport/`  | `core/`                                | handle file I/O, render Solid components  |
| `panels/`    | `components/`, bridge (read), `Command` | mutate `core/` directly                   |
| `app/`       | all of the above                       | leak module-internal types upward         |

If a feature seems to require a boundary violation, the right answer is almost always to move state up to `app/` or push a primitive down into `core/`.

## Why these constraints

The editor will only feel coherent if the underlying model is coherent. The constraints above exist so that:

- **Undo always works.** Every action is reversible, end-to-end.
- **Panels never lie.** What you see in the Scene Tree, the Properties panel, and the Viewport is always the same scene at the same instant.
- **Refactors stay local.** Module boundaries mean a viewport rewrite, a panel redesign, or a project-format change can each happen without rippling outward.

## Audit scripts

Each major panel has a corresponding `npm run audit:*` script (see `package.json`) that runs structural checks against that subsystem. These exist to catch contract drift early — for example, a panel reaching into `core/` without going through the bridge.
