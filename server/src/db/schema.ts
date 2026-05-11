/**
 * Drizzle ORM schema — 4 tables as defined in docs/sync-protocol.md § 資料模型
 *
 * users / sessions / scenes / scene_versions
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
  github_id: bigint('github_id', { mode: 'number' }).unique().notNull(),
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
