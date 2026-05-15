/**
 * Drizzle ORM schema — 4 tables as defined in docs/sync-protocol.md § 資料模型
 *
 * users / sessions / scenes / scene_versions
 *
 * L3-A addition: yjs_documents — full-snapshot persistence for HocusPocus
 * extension-database.  Stores the latest Y.Doc encoded state per scene.
 * Note: L3-B spec describes an append-only yjs_updates table; this table uses
 * the snapshot model that matches @hocuspocus/extension-database's fetch/store
 * contract.  Migration to append-only is deferred to L3-B.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/**
 * bytea custom type — not natively exposed by drizzle-orm/pg-core.
 * The driver returns a Buffer; we keep it as Buffer in TS land.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // Nullable: magic-link sign-in creates users without a GitHub account.
  // UNIQUE still enforced; NULLs do not conflict in unique indexes (Postgres).
  github_id: bigint('github_id', { mode: 'number' }).unique(),
  email: text('email').unique().notNull(),
  github_login: text('github_login').notNull(),
  avatar_url: text('avatar_url'),
  handle: text('handle').unique(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  plan: text('plan').notNull().default('free'),
  storage_used: bigint('storage_used', { mode: 'number' }).notNull().default(0),
});

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index('sessions_user_idx').on(t.user_id),
    index('sessions_expires_idx').on(t.expires_at),
  ],
);

// ---------------------------------------------------------------------------
// scenes
// ---------------------------------------------------------------------------

export const scenes = pgTable(
  'scenes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    owner_id: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull().default(0),
    body: bytea('body').notNull(),
    body_size: integer('body_size').notNull(),
    visibility: text('visibility').notNull().default('private'),
    forked_from: uuid('forked_from').references((): AnyPgColumn => scenes.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index('scenes_owner_idx').on(t.owner_id),
    index('scenes_public_idx')
      .on(t.visibility)
      .where(sql`visibility = 'public'`),
  ],
);

// ---------------------------------------------------------------------------
// scene_versions  (append-only history)
// ---------------------------------------------------------------------------

export const scene_versions = pgTable(
  'scene_versions',
  {
    scene_id: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: bytea('body').notNull(),
    body_size: integer('body_size').notNull(),
    saved_at: timestamp('saved_at', { withTimezone: true }).notNull().default(sql`now()`),
    // Forward-looking: under current write model, saved_by ≡ owner_id, so
    // versions are cascade-deleted via scene_id before this SET NULL fires.
    // SET NULL activates only if shared-editing lands (other users save versions).
    saved_by: uuid('saved_by')
      .references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.scene_id, t.version] })],
);

// ---------------------------------------------------------------------------
// magic_link_tokens  (unwired skeleton — refs #956; spec refs #955)
// ---------------------------------------------------------------------------
//
// Pattern: opaque plaintext token held by client/email; DB stores SHA-256
// hash only (refs #894).  one-time use enforced by used_at.  15-min TTL.
//
// onDelete: 'cascade' aligns with spec #955 GDPR § DELETE /api/me:
// when a user row is deleted, their pending magic link tokens are removed too.

export const magicLinkTokens = pgTable(
  'magic_link_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    email: text('email').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('magic_link_tokens_email_idx').on(t.email),
    index('magic_link_tokens_expires_idx').on(t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// scene_share_tokens  (share URL token model — refs #1012 G5; spec docs/cloud-project-spec.md § 資料模型)
// ---------------------------------------------------------------------------
//
// token = random opaque hex (32 char / 16 byte);  PRIMARY KEY — token is the identifier.
// revoked_at: soft-delete; owner can see history even after revoke.
// ON DELETE CASCADE: removing scene or user also removes their tokens.

export const sceneShareTokens = pgTable(
  'scene_share_tokens',
  {
    token: text('token').primaryKey(),
    scene_id: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('scene_share_tokens_scene_idx').on(t.scene_id),
    index('scene_share_tokens_active_idx')
      .on(t.scene_id)
      .where(sql`revoked_at IS NULL`),
  ],
);

// ---------------------------------------------------------------------------
// assets  (content-addressed binary storage — refs #957 F-1b; spec docs/asset-sync-protocol.md)
// ---------------------------------------------------------------------------
//
// Hash = sha256 hex (64 chars) of file content; primary key + URL identifier.
// storage_url = absolute Linode Object Storage URL (set by F-1c upload endpoint).
// ref_count: spec § 砍掉的東西 — v0 不啟用 GC,欄位先預留 (default 0).
// uploadedBy: nullable (not NOT NULL as in spec literal) to align with spec § Open Questions
//   「跨帳號 dedup vs GDPR」— GDPR 刪帳號時把 uploaded_by 改 null,storage 不動。
//   onDelete: 'set null' mirrors scene_versions.saved_by SET NULL pattern.
//   Spec字面寫 NOT NULL,但 § Open Questions 推薦路徑需要 nullable — 偏差已在 PR Notes 說明。

export const assets = pgTable(
  'assets',
  {
    hash: text('hash').primaryKey(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    size: bigint('size', { mode: 'bigint' }).notNull(),
    storageUrl: text('storage_url').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    refCount: integer('ref_count').notNull().default(0),
  },
  (t) => [index('assets_uploader_idx').on(t.uploadedBy)],
);

// ---------------------------------------------------------------------------
// yjs_documents  (HocusPocus full-snapshot persistence — refs #1064 L3-A)
// ---------------------------------------------------------------------------
//
// name = HocusPocus documentName, which equals the scene UUID (e.g. "abc-123").
// state = Y.Doc encoded state snapshot (Buffer); written by extension-database
//         onStoreDocument, read by onLoadDocument.
//
// L3-A only uses Y.Doc as an awareness transport (scene state not in Y.Doc),
// so this table will typically hold small/empty docs.
//
// L3-B forward note: spec describes an append-only yjs_updates table.
// This snapshot table is intentional for L3-A; migration to append-only
// is deferred to the L3-B phase.

export const yjsDocuments = pgTable('yjs_documents', {
  name: text('name').primaryKey(),
  state: bytea('state').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});
