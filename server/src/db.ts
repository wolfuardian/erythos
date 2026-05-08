/**
 * Postgres pool stub (D1 placeholder).
 * Real connection will be validated in D2 (schema migration).
 */
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Do not run any queries at startup — D2 will handle schema init.
