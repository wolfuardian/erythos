/**
 * Postgres connection — drizzle ORM wrapping a pg Pool.
 *
 * Exports:
 *   db   — drizzle instance for typed queries
 *   pool — raw pg Pool for auth adapters / raw SQL that drizzle cannot express
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './db/schema.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
