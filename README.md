# Erythos

A web-based 3D scene editor for Three.js — designed by someone who cares about every panel header, every keystroke, and every empty state.

> ![Erythos editor screenshot](docs/images/hero.png)
> _Replace this with a hero screenshot. Recommended size: 1600 × 900._

**[Live demo](#)** · **[Screenshots](#screenshots)** · **[Architecture](docs/architecture.md)**

---

## Why Erythos

Three.js gives you the engine. Existing editors mostly give you either an engineer's UI ([Three.js Editor](https://threejs.org/editor/)) or a closed black box ([Spline](https://spline.design/), [Womp](https://womp.com/)).

Erythos sits in the middle: an **opinionated, polished editor for building Three.js scenes on the web**, built around the conviction that a good editor is felt before it is understood. Every interaction is shaped by the question _"would I want to use this every day?"_.

It is, first and foremost, a personal tool — and that's the point. The taste comes from one person actually using it.

## Status

Active development. UI and architecture are stabilising; APIs are subject to change.

This is a personal project pursued for the love of the craft. Issues and PRs are welcome but **not actively solicited** — see [Contributing](#contributing) below.

## Stack

- **TypeScript** (strict mode)
- **[SolidJS](https://www.solidjs.com/)** — fine-grained reactive UI
- **[Three.js](https://threejs.org/)** — WebGL rendering
- **[Vite](https://vitejs.dev/)** — build tooling
- **[Vitest](https://vitest.dev/)** + **[Playwright](https://playwright.dev/)** — testing

## Quick Start

```bash
npm install
npm run dev      # start dev server (port 3000)
npm run build    # type-check + bundle
npm run test     # vitest unit tests
```

Type-checking runs through `npm run build` (no standalone `tsc` CLI installed).

Windows convenience launcher: `scripts/launch.bat` (kills any prior dev server on port 3000, starts fresh, opens browser).
POSIX equivalent: `scripts/launch.sh`.

## Project Structure

```
src/
├─ app/          # editor shell, layout, bridge between core ↔ UI
├─ core/         # domain model, scene graph, project IO (no UI deps)
├─ viewport/     # Three.js viewport renderer
├─ panels/       # dockable panels
│  ├─ scene-tree, properties, project, environment, viewport, prefab
├─ components/   # cross-panel UI primitives
└─ styles/       # design tokens (Twilight theme)
```

Each module ships with a local context document describing its scope and conventions.

A more detailed architecture write-up lives in [`docs/architecture.md`](docs/architecture.md).

## Architecture Contracts

Three invariants enforced across the codebase. Violating them is grounds for revert:

1. **Command pattern** — all scene mutations go through `Command + editor.execute()` so undo/redo stay coherent.
2. **Event ordering** — Editor emits events → bridge updates signals → panels re-render. The order `objectAdded → sceneGraphChanged` must not be reversed.
3. **Module boundaries** — `core/` does not depend on UI; `panels/` access state only via the bridge; `viewport/` does not handle file I/O.

## Screenshots

> _Add screenshots here once captured. Suggested set:_
> - _Full editor view (scene tree + viewport + properties)_
> - _A short 15–30s GIF showing object creation and manipulation_
> - _One panel close-up showing UI craft (e.g. properties panel)_

## How It's Built

This project is developed with **AI as primary implementer** and **a human as designer, architect, and decision-maker**. Specifications, mockups, UX critique, and product judgement are mine; the day-to-day TypeScript output is generated and refined through structured collaboration with Claude Code, with all changes reviewed before landing.

I find this honest is more useful than pretending otherwise. The interesting work — what to build, what it should feel like, where to draw module boundaries, what to throw away — is unchanged. Only the typing has been delegated.

## Contributing

This is a single-maintainer personal project pursued for craft. To set expectations:

- **Issues** — bug reports welcome; feature requests will be read but rarely acted on unless they match the project's direction.
- **PRs** — not currently accepted while the architecture is still moving. Forks are welcome.
- **No SLA** — replies are best-effort.

If you build something on top of Erythos, I'd love to hear about it.

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).

Built by [Eos Wolfuardian](https://github.com/wolfuardian).
