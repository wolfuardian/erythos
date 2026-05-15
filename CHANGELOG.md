# Changelog

All notable changes to Erythos will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-05-15

Audit-driven polish + quality release. Establishes ERROR CODE
taxonomy and applies it across scene / sync / asset paths.
Resolves v0.3 audit findings across four axes (architecture /
spec drift / code quality / test coverage). Schema v3 → v4
migration introduces `primitives://` scheme for built-in
geometry URLs.

### Added

#### ERROR CODE taxonomy (foundation)

- `docs/error-codes.md` — taxonomy spec (naming convention
  `E#### ERR_SCREAMING_SNAKE`, numeric segment allocation,
  registry table, wire envelope, how-to-add checklist)
- `src/core/errors/codes.ts` — client error code registry +
  `formatErrorMessage(code, human)` helper
- `E1004 ERR_SCENE_INVARIANT` (`SceneInvariantError`) +
  `E1101 ERR_SCENE_PAYLOAD_TOO_LARGE` (`PayloadTooLargeError`)
  as reference implementations
- `E1201`–`E1206` asset segment for `POST /api/assets` errors
  (per-file / total quota / hash mismatch / invalid form /
  missing field / unauthorized); client `HttpAssetClient`
  parses `{error, code}` body and formats display as
  `${human} (${code})`
  (PR [#1049](https://github.com/wolfuardian/erythos/pull/1049),
   [#1055](https://github.com/wolfuardian/erythos/pull/1055))

#### Schema v4 + `primitives://` scheme

- Dedicated `primitives://<name>` URL scheme for built-in
  geometry (box / sphere / plane). Replaces synthetic
  `project://primitives/*` and its scattered path-prefix
  special-cases in `Editor.loadScene` + `uploadSceneBinaries`
- `src/core/scene/io/migrations/v3_to_v4.ts` — auto-rewrites
  `project://primitives/<type>` → `primitives://<type>` on load
- `docs/erythos-format.md` § URI Scheme + § v3 → v4 Migration
- 4 producer sites updated; scheme-based walker filters replace
  path-prefix matching
  (PR [#1058](https://github.com/wolfuardian/erythos/pull/1058))

### Fixed

#### `deleteCloudProject` silent failure (#1041)

- Server `4xx` / `5xx` now surfaces via
  `alert(${human} (${code}))` instead of silently closing —
  user knows deletion did not succeed. Network error path
  preserved (close anyway; user can retry from Welcome after
  reconnecting)
  (PR [#1051](https://github.com/wolfuardian/erythos/pull/1051))

#### Component listener leak (audit P0)

- `EditorSwitcher.tsx` + `UserMenu.tsx`: `pointerdown` listener
  registered at component body root → wrapped in `createEffect`
  gated by `open()`. Aligns with `components/CLAUDE.md`
  convention; fixes HMR-time leak
  (PR [#1052](https://github.com/wolfuardian/erythos/pull/1052))

### Refactored (audit-driven)

#### Dead code removal

- `SceneOpsToolbar.tsx` + `.module.css` — 0 importer; also
  flagged by architecture audit for bypassing `bridge` to call
  `editor.loadScene` directly
- `mockAuth.ts` — v0 stub, superseded by `AuthClient`
- `EnvironmentSettings.ts` — v1 migration shim, no consumer
  (PR [#1056](https://github.com/wolfuardian/erythos/pull/1056))

#### styles-convention compliance

- `UserMenu.tsx` storage indicator: inline `width: ${pct}%` →
  CSS variable injection (`--storage-pct`), consumed by
  `.quotaFill` in module CSS
- `ContextMenu.tsx` + `SyncConflictDialog.tsx`: `class={}`
  ternary in template literal → `classList`
  (PR [#1056](https://github.com/wolfuardian/erythos/pull/1056))

#### TypeScript cleanup

- `ShadingManager.ts`: removed 10 `as any` casts —
  `@types/three@0.184.1` already types
  `Scene.environmentIntensity` + `environmentRotation`
  (no module augmentation needed); dropped dead `Euler`
  fallback branch
  (PR [#1061](https://github.com/wolfuardian/erythos/pull/1061))

#### `App.tsx` duplicate elimination

- Extracted `registerEditorKeybindings(editor)` (6 keybindings)
  and `makeAuthCallbacks(authClient)` (5 auth field bridge
  deps) into `src/app/editorKeybindings.ts` +
  `src/app/authCallbacks.ts`. Local + cloud project paths now
  call helpers; App.tsx −29 lines
  (PR [#1063](https://github.com/wolfuardian/erythos/pull/1063))

### Tests

- `server/src/__tests__/scene-routes.test.ts` +7 cases for
  `DELETE /api/scenes/:id` — endpoint had zero coverage despite
  destructive semantics (owner-only / 404 leak prevention /
  cascade delete via FK)
  (PR [#1062](https://github.com/wolfuardian/erythos/pull/1062))
- `src/core/scene/io/__tests__/v3_to_v4.test.ts` +8 migration
  cases (PR #1058)

### Docs / Meta drift fixes

- `docs/asset-sync-protocol.md` § Quota: free `500 MB` →
  `150 MB` (aligns with v0.3 onboarding + server
  `FREE_TOTAL_QUOTA`)
- `docs/sync-protocol.md` users schema: `github_id NOT NULL` →
  nullable (magic-link compat already in implementation)
- `docs/erythos-architecture.md` § 認證: Library
  `Lucia / Auth.js` → self-rolled HMAC (D3 Option C)
- `CLAUDE.md` 事件名: `objectAdded → sceneGraphChanged` →
  `nodeAdded → sceneReplaced` (aligns with `SceneDocument.ts`);
  模組表 environment-panel / prefab-panel 路徑收斂
- `src/core/CLAUDE.md`: Browser API 例外 paragraph for
  `core/network/` / `core/auth/` / `core/sync/` subdirs
- `src/app/App.tsx:469` cross-tab reload: INTENTIONAL bypass
  注解 explaining why direct `sceneDocument.deserialize()`
  is preferred over `Editor.loadScene()` for cloud refresh
  (PR [#1050](https://github.com/wolfuardian/erythos/pull/1050),
   [#1057](https://github.com/wolfuardian/erythos/pull/1057))

### Known limitations (deferred to v0.5)

- Local → Cloud project upgrade flow
  ([#1053](https://github.com/wolfuardian/erythos/issues/1053))
- Anonymous → Registered scene migration UI
  ([#1054](https://github.com/wolfuardian/erythos/issues/1054))
- P1 test coverage gaps — Clipboard / MultiCmdsCommand /
  ShareTokenClient / viewport pure geometry
  ([#1059](https://github.com/wolfuardian/erythos/issues/1059))
- G6 Offline cold-start viewer mode not entered
  ([#1060](https://github.com/wolfuardian/erythos/issues/1060))

[0.4.0]: https://github.com/wolfuardian/erythos/releases/tag/v0.4.0

## [0.3.0] — 2026-05-15

Free-tier onboarding + cloud project recovery. Quota enforcement
(3 cloud scenes / 150MB assets per user), auto-provisioned Demo
scene for new sign-ups, and inline cloud-project management from
both the editor toolbar and the Welcome list.

### Added

#### Cloud project management

- Delete cloud project — `DELETE /api/scenes/:id` (owner-only;
  non-owner → 404) + ProjectChip dropdown "Delete project" action
  (PR [#1040](https://github.com/wolfuardian/erythos/pull/1040))
- Inline delete from Welcome cloud list — trash button per row +
  ConfirmDialog; recovery path for an unopenable / invalid project
  (PR [#1048](https://github.com/wolfuardian/erythos/pull/1048))

#### Free-tier quota

- 3 cloud scenes per user, 150MB total asset storage (revised down
  from the v0.2 working hypothesis of 10 scenes / 500MB)
- `E1003 ERR_SCENE_QUOTA_EXCEEDED` returned with `{error, code}`
  shape on `POST /api/scenes` when the limit is reached
  (PR [#1043](https://github.com/wolfuardian/erythos/pull/1043))

#### Demo scene auto-provision (onboarding)

- New users get one starter Demo scene (cube + directional light)
  created server-side during user provision; counts toward the
  3-scene quota, user-deletable
- `shared/onboarding/demo-scene.json` — single source: server imports
  to provision, client test imports the same file for validity check
- OAuth + magic-link signup paths wrap user-insert + demo-insert in
  `db.transaction()` for atomicity
  (PR [#1045](https://github.com/wolfuardian/erythos/pull/1045))

#### Client-side error code display

- `${error} (${code})` parallel format defined for the first time on
  the client; applied to cloud-project create + delete error paths.
  Seeds the client half of the [#1025] ERROR CODE taxonomy
  (PR [#1046](https://github.com/wolfuardian/erythos/pull/1046),
   [#1048](https://github.com/wolfuardian/erythos/pull/1048))

### Fixed

- ProjectChip dropdown "Delete project" action invisible on cloud
  projects — `bridge.projectType()` read `editor.projectManager.type`,
  which is the LocalProjectManager singleton for cloud projects
  (always `'local'`). Mirrored the [#1036] deps-threading fix. Same
  fix restores the Toolbar Cloud sync indicator, which had the same
  latent gate bug since G3
  (PR [#1046](https://github.com/wolfuardian/erythos/pull/1046))
- Cloud project create errors only surfaced HTTP status — now parses
  the server's response body and displays `${error} (${code})`
  (PR [#1046](https://github.com/wolfuardian/erythos/pull/1046))

### Tests

- `src/__tests__/demo-scene-validity.test.ts` —
  `shared/onboarding/demo-scene.json` round-trips through
  `SceneDocument.deserialize()` (regression guard for the T2-class
  "server hand-written blob fails client load" scenario)

### Changed

- `docs/cloud-project-spec.md` § Onboarding revised from v0.2 working
  hypothesis to v0.3 拍板: scene 10→3, asset 500MB→150MB, placeholder
  empty → auto-provisioned Demo scene

### Known limitations (deferred to v0.4)

- `assets.ts` error responses don't follow `{error, code}` ERROR CODE
  pattern; `HttpAssetClient` ignores response bodies
  ([#1047](https://github.com/wolfuardian/erythos/issues/1047))
- `deleteCloudProject` swallows non-2xx DELETE responses
  ([#1041](https://github.com/wolfuardian/erythos/issues/1041), polish)
- ERROR CODE taxonomy full rollout
  ([#1025](https://github.com/wolfuardian/erythos/issues/1025))
- `primitives://` dedicated scheme — still synthetic
  `project://primitives/*` ([#1027](https://github.com/wolfuardian/erythos/issues/1027))

[0.3.0]: https://github.com/wolfuardian/erythos/releases/tag/v0.3.0

## [0.2.0] — 2026-05-14

Cross-device cloud scene sync. Adds canonical cloud projects alongside
v0.1's local-first model, share token viewer mode, offline UX, and
cross-tab coordination. L1 cross-device手測 9 cases all green.

### Added

#### Cloud projects (Phase G1-G6)

- `ProjectManager` interface (Local + Cloud implementations)
- `CloudProjectManager` with IndexedDB throwaway cache
- Cold-start auto-resume via `localStorage.activeProject`
- Welcome screen "Your Cloud Projects" list
- New project dialog Local/Cloud toggle (Local default)
- Toolbar cloud sync indicator

#### Share tokens — read-only viewer (G5)

- Owner-revokable opaque hex tokens (no TTL)
- `ShareDialog` with copy / revoke
- Anonymous viewer mode with read-only enforcement: undo/redo gated,
  scene-tree drag/drop disabled, transform short-circuited, property
  edits no-op

#### Offline UX (G6)

- 30s ping `HEAD /api/health` for online/offline state
- `OfflineBanner` when offline
- `saveScene` short-circuit when `navigator.onLine === false`

#### Cross-tab coordination

- Cross-tab cache invalidation (#1006 resolved)
- `AutoSaveHandle.suppress(on)` refcounted — prevents the cross-tab
  reload echo storm where broadcast → deserialize → schedule push →
  re-broadcast could silently revert in-flight user edits

#### Auth lifecycle

- Magic-link session TTL bumped 30 → 90 days
  (reduces Resend free-tier pressure for repeat visitors)

#### Error envelope (seeds #1025 taxonomy)

- `{error: <human>, code: "E#### ERR_…"}` shape for new user-facing
  errors
- `E1001 ERR_USER_ID_FORMAT` + `E1002 ERR_SCENE_ID_FORMAT`
- All `:id` routes validate UUID at middleware (400 instead of 500
  for non-UUID input like `/api/scenes/me`)

### Fixed

- Empty scene blob on cloud project create — `createEmptyScene()`
  factory; resolves T2 release blocker (PR #1024)
- AutoSave race when debounce fires during in-flight push — `lastFlush`
  promise chain serializes concurrent `flushNow` callers; resolves
  T3 prod 409 (PR #1028)
- `Editor.loadScene` minted a second server scene on cloud project open
  — gated `syncEngine.create()` by `syncSceneId === null` (PR #1028)
- `SyncConflictDialog` buttons appeared dead — bridge wraps
  `resolveSyncConflict` + clears `syncConflict` signal; resolves T5/T6
  (PR #1029)
- Cross-tab reload echo storm — `AutoSaveHandle.suppress()` +
  reload-path wrap (PR #1034)
- `uploadSceneBinaries` walker tried to `readFile` `project://primitives/*`
  built-in meshes; skip at walker (PR #1026)

### Tests

- New `src/__tests__/cloud-project-lifecycle.integration.test.ts` —
  full client wire driven against in-process fake server; 8 cases
  covering create / load / sequential push / race / suppress / conflict
  resolve. Locks regression behaviour pre-deploy
- Bridge `syncConflict` +2 cases (signal cleared after resolve)
- `uploadSceneBinaries` +1 case (primitives skip)
- Server `:id` UUID validation +1 case per route

### Known limitations (deferred to v0.3)

- Real-time co-edit (CRDT / multi-cursor)
- Anonymous → cloud project URL pre-sign-in flow ([#1030](https://github.com/wolfuardian/erythos/issues/1030))
- Error code taxonomy full rollout ([#1025](https://github.com/wolfuardian/erythos/issues/1025))
- `primitives://` dedicated scheme — still synthetic `project://primitives/*` ([#1027](https://github.com/wolfuardian/erythos/issues/1027))

[0.2.0]: https://github.com/wolfuardian/erythos/releases/tag/v0.2.0

## [0.1.0] — 2026-05-13

Initial public release. Local-first 3D editor with cloud backup,
GitHub OAuth + magic-link auth, and GDPR-compliant data lifecycle.

### Added

#### Editor core

- Local-first project model via File System Access API
  (`openProject(FileSystemDirectoryHandle)`)
- Scene document with Command pattern for undo/redo
- Three.js viewport with selection, transform gizmos, environment controls
- Dockview-based panel system: scene tree / properties / prefab / project / environment
- AutoSave with 2s debounce → local `scenes/scene.erythos`
- Prefab system (project-scoped)
- Asset pipeline: GLTF/GLB import via `project://` URLs

#### Cloud backup (Phase F-1)

- Asset sync to S3-compatible storage (Linode Object Storage)
- Pre-push binary upload + URL rewrite (`project://` → `assets://`)
- Quota tracking (`users.storage_used`)
- Scene sync via `PUT /api/scenes/:id` with If-Match versioning

#### Authentication

- GitHub OAuth sign-in
- Magic-link email auth via Resend
  (15-minute TTL, SHA-256 hashed tokens, atomic claim)
- Session cookies (httpOnly, SameSite=Lax, secure in prod)
- Sign-in dialog with dual-path UI (OAuth + email)

#### Multi-tab coordination

- Web Locks + BroadcastChannel via `MultiTabCoord`
- Same-device version sync between tabs

#### GDPR / data lifecycle

- Account deletion with 30-day grace period (soft delete)
- Full data export (scenes + assets metadata as JSON)
- Audit log for sensitive operations
- Cookie consent banner

#### Ops / infrastructure

- Daily PostgreSQL backup to S3 with 30-day retention
- GitHub Actions CI/CD: push main → VPS atomic symlink flip
- Pino structured logging (JSON in prod, pretty in dev)
- `GET /api/metrics` with basic auth (in-memory counters)
- `GET /api/health` with DB connectivity check
- Magic-link token reaper cron (30-day retention)

#### Security

- CSP / Permissions-Policy / Origin middleware
- Content-Disposition filename sanitization
- Caddy XFF strip (prevent client IP spoofing)
- Defensive chown in deploy pipeline

#### Accessibility

- WCAG AA compliance: dialog role + focus trap, menu semantics, aria-live regions

### Performance

- Lighthouse Performance: 0.62 → **0.94**
- LCP: 6.5s → **2.6s**
- Bundle chunk splitting + dynamic imports

### Known limitations (deferred to v0.2)

- No cross-device scene editing (local-first; cloud sync is backup-only)
- Multi-tab in-memory scene merge — tab2 needs reload to see tab1's changes
  ([#1006](https://github.com/wolfuardian/erythos/issues/1006))
- Sync error retry banner only triggers when scene is bound to server
  (phantom in v0.1 UX — surfaces in v0.2 cloud project)

### Tech baseline

- TypeScript strict mode
- SolidJS + Three.js + Dockview + Vite
- Hono + Postgres + Drizzle ORM (server)
- Node.js LTS

[0.1.0]: https://github.com/wolfuardian/erythos/releases/tag/v0.1.0
