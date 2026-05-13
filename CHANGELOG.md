# Changelog

All notable changes to Erythos will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
