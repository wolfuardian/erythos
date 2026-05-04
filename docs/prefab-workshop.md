# Prefab Workshop — Design

Status: Draft (2026-05-04)
Owner: AH

This document captures the forward design for redesigning the Prefab system around two principles: **URL-first asset references** and **Pure-mirror live sync**. It also introduces the **Workshop** sub-editor concept (sandbox model).

The current `PrefabPanel` (read-only list + 3D preview) and the dual-storage situation (`PrefabStore` IndexedDB vs `ProjectFile` filesystem) are intentionally being replaced. Anything in the existing codebase that is incompatible with this design is in scope to be cut.

## Goals

1. `.prefab` file is the **canonical** representation. IndexedDB is at most an offline cache; never authoritative.
2. All asset references (GLB and prefab) are **URLs**, fetchable by a single mechanism. No more opaque `source` string IDs.
3. **Pure mirror** live sync: editing a `.prefab` file rebuilds every instance in every open scene. No per-instance overrides.
4. **Workshop** = a sandbox sub-editor that opens a single `.prefab` for editing. Single-document architecture remains; Workshop runs alongside the main scene without becoming a second document type.
5. Existing GLB pipeline migrates to URL-first in lockstep. Spec drift between `MEMORY.md`'s "URL-first principle" and the code is closed in this redesign.

## Non-goals (declared, with rationale)

- **Per-instance overrides (Unity-style).** Tried before, abandoned for complexity. Pure mirror only. Any pattern that hints at overrides (delta tracking, override reconciliation, partial-apply) is a violation of this design.
- **True multi-document editor.** `Editor.ts` stays single-document. Workshop is a sandbox panel using its own `SceneDocument` instance, not a peer document with its own undo stack registered globally.
- **Remote / HTTP asset URLs in P1.** URLs are local blob URLs derived from project files. The URL abstraction makes remote URLs a future extension, but P1-P4 ship with local-only.

## Asset URL Contract

All asset references in scene/prefab data are URLs that can be passed to `fetch()` and yield an `ArrayBuffer` (binary assets) or JSON (prefab files).

```
ProjectFile (canonical, on disk)
  ↓ projectManager.urlFor(path) → blob URL
URL string
  ↓ fetch(url) → ArrayBuffer | JSON
  ↓ ResourceCache.loadFromURL(url) | PrefabRegistry.loadFromURL(url)
in-memory parsed form
```

`projectManager.urlFor(path)` returns a stable URL for the lifetime of a project session. When a file is rewritten (Save), the URL is **revoked and reissued**, and a `fileChanged(path, newURL)` event fires.

### SceneNode component shape (after migration)

```ts
// before
node.components.mesh = { source: "model.glb" }            // opaque ID

// after
node.components.mesh   = { url: "blob:...", path: "models/model.glb" }
node.components.prefab = { url: "blob:...", path: "prefabs/foo.prefab" }
```

`url` is the load handle. `path` is the human/serializable identifier; on save/load round-trip we serialize `path` only, and the URL is recomputed on hydrate. This is what makes a project portable across reloads and machines.

## Caches

Two parallel caches, both URL-keyed:

- `ResourceCache` — `Map<url, Group>`. Already exists, gets a `loadFromURL` entry point. `loadFromBuffer` becomes internal.
- `PrefabRegistry` — `Map<url, PrefabAsset>`. New. Replaces `Editor._prefabAssets` Map.

IndexedDB (`GlbStore`) demoted to **offline cache only**: optional warm-up on hydrate when a URL's underlying file is unavailable. Not consulted during normal load. After P2, can be removed entirely if File System Access provides reliable persistence.

## Event Flow & Live Sync

```
User edits prefab in Workshop
  → Workshop.commit() writes .prefab JSON to file
  → ProjectManager.fileChanged(path, newURL)
  → PrefabRegistry refetches URL → updates cached PrefabAsset
  → emits prefabChanged(url)
  → SceneSync finds all nodes with components.prefab.url === url
  → rebuilds each instance subtree from updated PrefabAsset
```

Pure mirror means: **the rebuild blows away whatever was at the instance's children**. Instance root keeps its transform and `components.prefab` marker; everything below is reconstituted from the prefab. No reconciliation. If a user moved a child node inside an instance, that change is lost on next rebuild.

This is the deal of choosing (a). The UX must make it visible (e.g. instances are visually marked, child nodes inside an instance are non-selectable in scene tree).

## Workshop Sandbox

Workshop is a panel. When opened with a target `.prefab`:

1. Fetch URL → `PrefabAsset`
2. Build a **sandbox `SceneDocument`** (separate instance, not registered with main `Editor`)
3. Create a Workshop-local `History` instance bound to the sandbox `SceneDocument`
4. Render a Three.js scene scoped to Workshop's DOM container, reading the sandbox document via a Workshop-local `SceneSync`
5. Asset browser sub-panel: lists project files, drag-into-Workshop creates a new node referencing that URL (typical: drag a `.glb` → mesh node)
6. On commit: serialize sandbox `SceneDocument` → `PrefabAsset` → write to `.prefab` file → fileChanged event flows
7. On discard: drop sandbox document; nothing persists

Main scene during Workshop: stays editable. Main `Editor` is unaware of the sandbox. The sandbox is an isolated mini-editor with its own command queue. **Commands executed in Workshop never enter the main undo stack.**

This keeps `Editor.ts` single-document while giving the user a self-contained editing surface for prefabs.

### What's *not* in Workshop (explicitly cut surface)

- No selection sync between Workshop and main scene
- No drag-from-Workshop-into-main-scene (instantiation still goes through scene tree right-click or asset browser drag-onto-viewport, not Workshop)
- No nested prefabs in P1-P4 (a prefab containing another prefab reference is out of scope; surfaces as flat nodes only)

## Phasing

Phases are independently shippable. P3 is the first irreversible step.

### P1 — URL-first asset model (no UI change)

- Add `projectManager.urlFor(path)` and `fileChanged` event
- Migrate `ResourceCache` to URL-keyed (`loadFromURL`); keep `loadFromBuffer` internal
- Migrate `components.mesh` shape: `{ source }` → `{ url, path }` with autosave migration
- New `PrefabRegistry` URL-keyed; replaces `Editor._prefabAssets`
- Migrate `components.prefab.id` → `components.prefab.url`/`path`
- Existing `PrefabPanel` reads from `PrefabRegistry`; unchanged behavior

Reversible: yes. Old IndexedDB still warm. No user-visible change beyond URL plumbing.

### P2 — Workshop scaffolding (parallel to PrefabPanel)

- New `WorkshopPanel` registered as Dockview editor type
- Sandbox `SceneDocument` + Workshop-local `History` + Workshop-local `SceneSync`
- Asset browser sub-component (reads `projectManager.getFiles()`, filtered)
- Drag-from-asset-browser-to-Workshop creates mesh node; drag-from-scene-tree-to-Workshop is **not** P2 (deferred)
- Open/Discard actions; **commit deferred to P3**

Reversible: yes. Workshop is a new panel; nothing else changes.

### P3 — Live sync + commit

- Workshop commit writes `.prefab` to file via `projectManager.writeFile(path, json)`
- `fileChanged` event fires → `PrefabRegistry.refetch(url)` → `prefabChanged(url)` event
- `SceneSync` listens and rebuilds matching instance subtrees
- UI: instances visually marked; nodes inside an instance non-selectable in scene tree

Reversible: partially. Once users start saving prefabs through Workshop, file format is canonical. Old IndexedDB-only prefabs need migration script.

### P4 — Decommission old PrefabPanel

- Move "Save as Prefab" entry point from scene tree right-click into Workshop creation flow (drag scene node → Workshop opens new prefab)
- Delete `PrefabPanel.tsx` and `useThumbnails.ts`
- Delete `PrefabStore.ts` (IndexedDB) and any remaining read paths

Reversible: no. After P4, `.prefab` file is the only surface.

## Surface to Cut (Pre-P1 cleanup pass)

Anything that contradicts Pure-mirror or URL-first should be removed before P1, to keep the new design clean:

- `useThumbnails.ts` — couples to old PrefabPanel preview model; reassess in P2 whether Workshop wants thumbnails (likely yes but URL-keyed)
- `components.prefab.id` references throughout `core/commands/` — migrate to `url`/`path`
- `Editor._prefabAssets` Map → delete after `PrefabRegistry` exists
- `SaveAsPrefabCommand` → keep, but rewrite to write file + register in `PrefabRegistry` instead of `Editor.registerPrefab`
- `InstantiatePrefabCommand` — keep, but reads from `PrefabRegistry` by URL

After P3 ships, run `/codebase-cleanup` to remove dead branches; after P4, run `/codebase-health` to verify no Unity-style override patterns crept in.

## Open Questions

- **Identifier serialization across machines.** When a project is moved, blob URLs differ but `path` is stable. Does autosave serialize `path` only and rebuild URLs at load, or store both? **Decision: `path` only; URL is always recomputed.** Documented for clarity.
- **File watching.** P1-P3 assume `fileChanged` event fires whenever Workshop commits. If File System Access lets external editors modify `.prefab` directly, do we listen for those changes? **Decision: out of scope; only commits originating from this app trigger live sync. External edits require reload.**
- **Multiple Workshops open simultaneously.** Different prefabs in different docked Workshop panels — supported in principle (each has its own sandbox). Concurrent commits to the same prefab from two Workshops is undefined; last-write-wins is acceptable.
- **Undo across Workshop close.** If user opens Workshop, edits, commits, closes — main scene's instances visibly rebuilt. Can main `Editor.history.undo()` reverse that? **Decision: no.** Workshop commit is a file-level operation, not a scene mutation. Undo affects scene only. Undoing prefab edits is via Workshop reopen + further edits, or filesystem-level revert.

## Glossary

- **Pure mirror**: instance is a 1:1 reflection of prefab. No local overrides.
- **Sandbox**: separate `SceneDocument` instance, not registered with main `Editor`.
- **URL-first**: every asset reference is a URL fetchable via `fetch()`, derived from canonical project files.
- **Live sync**: edit-prefab → all-instances-update flow, driven by file write + URL refetch + scene rebuild.
