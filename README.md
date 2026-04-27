# Erythos

A web-based 3D editor built with TypeScript, SolidJS, and Three.js.

## Stack

- TypeScript (strict mode)
- [SolidJS](https://www.solidjs.com/) — fine-grained reactive UI
- [Three.js](https://threejs.org/) — WebGL 3D rendering
- [Dockview](https://dockview.dev/) — panel layout
- [Vite](https://vitejs.dev/) — build tooling

## Development

```bash
npm install
npm run dev      # start dev server
npm run build    # type-check + bundle
npm run test     # vitest unit tests
```

Type-check goes through `npm run build` (the project does not install the standalone TypeScript CLI).

## Project Structure

```
src/
├─ app/          # editor shell, layout, bridge between core ↔ UI
├─ core/         # domain model, scene graph, project IO (no UI deps)
├─ viewport/     # Three.js viewport renderer
├─ panels/       # Dockview-managed panels
│  ├─ scene-tree, properties, project, environment, viewport, prefab
├─ components/   # cross-panel UI primitives
└─ styles/       # design tokens (Twilight theme)
```

Each module has a local `CLAUDE.md` describing its scope, contracts, and conventions.

## Architecture Contracts

Three invariants enforced across the codebase — violating them is grounds for revert:

1. **Command pattern** — all scene mutations go through `Command + editor.execute()` so undo/redo stay coherent.
2. **Event ordering** — Editor emits events → bridge updates signals → panels re-render. The order `objectAdded → sceneGraphChanged` must not be reversed.
3. **Module boundaries** — `core/` does not depend on UI, `panels/` access state only via the bridge, `viewport/` does not handle file I/O.

## Status

Active development. UI and architecture are stabilising; APIs are subject to change.

## License

MIT — see [LICENSE](./LICENSE).
