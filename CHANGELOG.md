# Changelog

All notable changes to Erythos will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
