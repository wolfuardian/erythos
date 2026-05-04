# Prefab Inline Edit — Design

Status: Draft (2026-05-04)
Owner: AH
Supersedes: `docs/prefab-workshop.md` (Workshop sub-editor model, scrapped after P2-P4 shipped without e2e validation and turned out non-functional in practice)

This document captures the simplified prefab system: **`.prefab` is both a file and a container**. Edits happen in-place in the main scene; the file mirrors the prefab subtree continuously.

The URL-first asset model from P1 (a/b/c) is unchanged and stays. The Workshop sub-editor (P2/P3 implementation) is removed.

## Model

```
.prefab file  ⇔  prefab instance subtree in scene tree
```

A `.prefab` file is the serialized form of one prefab. Any prefab instance in any scene has children that mirror the file. Edits to children — through any instance — write back to the file; all other instances rebuild to match.

There is no separate editor, no sandbox `SceneDocument`, no commit / discard / open-in-Workshop flow. The scene tree is the editor.

## Operations

| Operation | UX | Mechanism |
|-----------|----|-----------|
| Create new prefab | Scene-tree right-click → "Save as Prefab" (legacy P4-pre behavior) | `SaveAsPrefabCommand`: serialize subtree → `prefabs/<name>.prefab`, tag root with `components.prefab.path` |
| Instantiate existing prefab | Drag `.prefab` from ProjectPanel into viewport, or scene tree | New node with `components.prefab.path`, children populated from file via existing P3 rebuild engine |
| Edit prefab content | Add/remove/move/edit any descendant of an instance root in scene tree | SceneDocument mutation → instance-watcher detects "this is inside a prefab" → debounced re-serialize + writeFile |
| Sync to other instances | Automatic: file write → `fileChanged` → registry refetch → `prefabChanged` → SceneSync rebuilds all instances | Already implemented in P3 |

## Boundary: what's per-instance vs shared

- **Per-instance** (NOT written to file): instance root's transform, name, parent
- **Shared** (mirrored via file): everything in the children subtree of the instance root — names, transforms, components, structure

Pure-mirror semantics from P3 still apply: any instance edit propagates to all instances. There are no per-instance overrides on children.

## Architecture

### Reused from P1

- `ProjectManager.urlFor(path)` and `fileChanged` event
- `ResourceCache` URL-keyed
- `PrefabRegistry` (URL-keyed asset cache, `prefabChanged` event)
- `components.mesh = { url, path, nodePath? }` runtime shape, `{ path, nodePath? }` serialized
- `components.prefab = { url, path }` runtime shape, `{ path }` serialized

### Reused from P3

- `SceneSync.attachPrefabRegistry(registry)` — subscribes to `prefabChanged`
- `SceneSync._rebuildPrefabInstances(path, asset)` — wipes children and re-deserializes for each instance with matching `components.prefab.path`
- The architectural exception (this rebuild bypasses Command/undo) is preserved verbatim

### New in inline-edit

**`PrefabInstanceWatcher`** (new class, `src/core/scene/PrefabInstanceWatcher.ts`):
- Subscribes to `SceneDocument.events`: `nodeAdded`, `nodeRemoved`, `nodeChanged`
- For each event, walks ancestry of the affected node to find an enclosing prefab instance root (existing helper `findPrefabInstanceRoot` from P3-polish)
- If a prefab root is found, schedules a debounced (250ms) re-serialize + writeFile for that prefab's path
- Tracks "self-written" paths with a 50ms grace window so the resulting `fileChanged` does NOT trigger a rebuild on the same instance whose edit caused the write
- Other instances of the same prefab still rebuild normally (cross-instance propagation works)
- Owns its lifecycle: constructor takes (`sceneDocument`, `prefabRegistry`, `projectManager`); has `dispose()` for cleanup

### Self-write loop avoidance

```
Instance A edited
  → SceneDocument fires nodeAdded
  → PrefabInstanceWatcher finds enclosing instance root, prefab path = P
  → debounce 250ms
  → re-serialize subtree, writeFile(P, json), record self-write { path: P, until: Date.now() + 50 }
  → ProjectManager fires fileChanged(P, newURL)
  → PrefabRegistry refetches, fires prefabChanged(P, newAsset)
  → SceneSync._rebuildPrefabInstances(P, newAsset)
      → for each instance node with prefab.path === P:
          - check self-write registry: if "we just wrote P within last 50ms", skip THIS instance
          - else rebuild normally
```

The self-write registry lives in `PrefabInstanceWatcher`. SceneSync queries it before rebuilding. The 50ms window must comfortably exceed the round-trip from `writeFile → fileChanged → prefabChanged → rebuild`. If the round-trip is longer, the window may need extension.

Alternative considered: pass a `skipInstanceIds` argument through the rebuild path. Rejected — too invasive for an edge case, registry is simpler.

## Phasing

### R1 — Demolish + restore (one PR)

- Delete `src/panels/workshop/` entirely
- `src/app/editors.ts`: drop `workshopDef`
- `src/components/EditorSwitcher.tsx`: drop the `'workshop'` case + shortcut
- `src/app/workspaceStore.ts`: workspace migration `'workshop'` → fall back to `'project'` panel (or remove area; design TBD)
- Restore scene-tree right-click "Save as Prefab" (revert P4's removal)
- Remove the `application/erythos-scene-subtree` drag protocol (added in P4 for Workshop)
- Remove P3-polish "locked descendants" behavior — descendants must be editable in scene tree under the new model (FAB badge on instance root stays)
- Remove viewport raycast redirect (raycast on descendants should select descendants, not the instance root, since they're now editable)
- ProjectPanel: verify drag `.prefab` onto viewport instantiates (likely needs work — see R2)

After R1: system is functionally pre-P2 + URL-first infrastructure + P3 live sync engine present but only triggered by external file edits (no in-app trigger yet).

### R2 — Drag prefab from ProjectPanel into scene

- ProjectPanel: drag `.prefab` row → emit drag mime
- Viewport (or scene tree): accept drag, instantiate via `InstantiatePrefabCommand`
- Verify the existing flow still works post-R1 cleanup; fix gaps

### R3 — Write-on-mutation with 250ms debounce

- New `PrefabInstanceWatcher` class per design above
- Wire in `Editor.init`: `editor.prefabInstanceWatcher.start()`
- Wire in `Editor.dispose`: `watcher.stop()`
- SceneSync queries the self-write registry before rebuilding individual instances
- Tests:
  - Mutation under instance triggers writeFile after 250ms
  - Multiple rapid mutations debounce to one write
  - writeFile + fileChanged + prefabChanged + rebuild round-trip skips the originating instance
  - Cross-instance propagation: edit A, B/C/D rebuild
  - Discard write on dispose (don't fire after editor unmounted)

## Validation discipline (this time)

The Workshop redesign shipped 9 PRs without anyone opening a browser. AH owns this regression. For prefab-inline-edit:

- Each phase ends with **AH manually browser-tests** the dev server before merging
- AD runs build + tests as before, but their PR description must include "manual smoke test deferred to AH" — they don't claim functional verification they can't do
- If the manual smoke test fails, the PR is fixed or reverted before merge — not after

## Open questions

- **Workspace migration for `workshop` editorType**: existing users (probably just AH dev environment) have workspaces with `editorType: 'workshop'`. Pick a fallback: `project`, or remove area. Decision: remove area entry, let AreaTree fallback handle.
- **Empty prefab files**: a prefab can have no children (just the root). Allowed. Instances of empty prefabs are fine.
- **Renaming prefab files**: out of scope. If user renames `prefabs/foo.prefab` → `prefabs/bar.prefab` externally, all `prefab.path` refs in scenes break. Same as before; would need a path-rewrite migration tool, not in scope.
- **Concurrent multi-instance edits**: A and B both modify their children at exactly the same time. Last write wins (filesystem-level). Acceptable per design.
- **Undo across mutation that triggers write**: user's undo reverts the SceneDocument mutation; PrefabInstanceWatcher sees a new mutation event from the undo and writes again. File reflects post-undo state. Correct.

## Glossary

- **Prefab instance**: a SceneNode with `components.prefab.path` set
- **Prefab descendant**: any node whose ancestor chain contains a prefab instance
- **Self-write**: a writeFile triggered by this app's own mutation watcher (vs an external editor)
