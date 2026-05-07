# Decisions Log

> Long-term decisions for the Erythos project. One conclusion per line, **self-explanatory** (readable three months from now without context).
>
> Format: `- YYYY-MM-DD [tag]: <conclusion>`
>
> Rules:
> - Conclusions only — no process notes.
> - One line per decision; if it doesn't fit, split or it's not a decision.
> - Audit / review output without a clear decision: do not append.
>
> Maintenance: `/distill` or `/janitor` append automatically; manual append also OK.

---

- 2026-04 [solid-reactivity]: VectorDrag uses `<Index>` not `<For>` over primitive arrays — `<For>` is keyed by value, so `0.3 → 0.34` unmounts/remounts the child and wipes `onCleanup` listeners (issue #436)
- 2026-04 [solid-reactivity]: three repeated traps in derived UI — `createSignal(expr)` only samples once, `<Show>` children capture once on falsy→truthy switch (use `<Dynamic>` or `keyed`), and preview vs commit state must come from separate sources during interactive drag (issues #547→#553)
- 2026-05-04 [refactor]: splitting heat-map files reduces churn-score by ~half but doesn't relocate the heat — viewport stayed #1 even after `1061 → 643` lines, because it's churn-driven by feature work, not size-driven; future big-file decisions should weigh churn nature (feat-heavy vs fix-heavy) over raw line count
- 2026-05-05 [arch]: core/Editor↔Command type-only circular import is Command-pattern essential — both ends use `import type` (zero runtime cycle, just madge's design-layer warning); `editor.execute/undo/redo` are thin wrappers over `editor.history.*` for 51 callers' ergonomics; treated as accepted baseline, do not refactor unless async-command migration forces it
- 2026-05-05 [arch]: App.tsx churn (39 commits/30d) is feature-wiring noise, not lifecycle-coupling pain — no "change one thing, edit N places" signal; openProject/closeProject orchestration belongs to root component by nature; do not extract `useProjectLifecycle` hook (no second caller, idiom change without boundary fix, lifecycle-order migration risk asymmetric to gain)
- 2026-05-05 [types]: ID domains use branded types (`NodeUUID` / `PrefabId` / `AssetPath` / `BlobURL` in `src/utils/branded.ts`); mint at three boundaries — FS read (ProjectFile construction), JSON deserialise (`SceneDocument.deserialize`, `PrefabSerializer.deserializeFromPrefab`, `projectSession` localStorage), and external libs (`obj.uuid` from Three.js); caches that treat key as opaque (e.g. `PrefabRegistry._pathToURL` URL value, `ResourceCache` URL params) keep `string` — brand stops at cache boundary; `MeshComponent.nodePath` and FileSystemDirectoryHandle strings are NOT branded (different domains)
- 2026-05-05 [janitor]: cleared 21 stale items (9 archive-cache md, 1 scheduled-tasks lock, 12 twilight-* preview HTMLs); split `### 回應節奏` 55 lines from CLAUDE.md → `.claude/style-guide.md` (CLAUDE.md ~3175→~2300 tokens); clarified MEMORY.md path is auto-memory at `~/.claude/projects/<project>/memory/`
- 2026-05-07 [arch]: Schema v1 spec amendments merged (PR #815) — `nodeType` enum replaces `components` bag, `position/rotation/scale` full names, `version` literal field, prefab strict reference (no expand into parent SceneFile.nodes[]), `HexColor` at JSON boundary + `number` at runtime, env block enters SceneFile, `userData: {}` reserved; commander principle "嚴格取代鬆散"; implementation across ~30 files follows in 3 phases (foundation / switchover / invariants)
- 2026-05-07 [arch]: Schema v1 switchover merged (PR #819) — flat nodeType across 41 files (1135+/2128-), prefab pure reference (InstantiatePrefabCommand no longer expands into SceneFile.nodes), env block in SceneFile + AutoSave subscribes envChanged, asset URLs stay `assets://` at JSON boundary (runtime blob URLs held in `SceneSync._resolvedBlobUrls` map, never mutate `node.asset`), `userData = {}` invariant enforced, `v0_to_v1` round-trip guard via `typeof node.nodeType === 'string'` passthrough; PrefabInstanceWatcher kept but dormant (Phase 3 evaluate removal); minor visual flash on first sceneReplaced rebuild (clear order tradeoff, not data-loss) tracked for Phase 3
