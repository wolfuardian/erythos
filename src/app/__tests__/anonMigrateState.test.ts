/**
 * anonMigrateState.test.ts
 *
 * Unit tests for Anonymous → Registered migration localStorage helpers.
 * Uses vitest's built-in localStorage mock (jsdom environment).
 *
 * Refs: #1054
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getAddressedIds,
  markAddressed,
  isMigrationDisabled,
  disableMigration,
} from '../anonMigrateState';

const ADDRESSED_KEY = 'anon_migrate_addressed';
const DISABLED_KEY = 'migrate_prompt_disabled';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ── getAddressedIds ───────────────────────────────────────────────────────────

describe('getAddressedIds', () => {
  it('returns empty set when key does not exist', () => {
    expect(getAddressedIds().size).toBe(0);
  });

  it('returns empty set when key is invalid JSON', () => {
    localStorage.setItem(ADDRESSED_KEY, 'not-json{{{');
    expect(getAddressedIds().size).toBe(0);
  });

  it('returns empty set when stored value is not an array', () => {
    localStorage.setItem(ADDRESSED_KEY, '{"id":"x"}');
    expect(getAddressedIds().size).toBe(0);
  });

  it('returns set of IDs from valid array', () => {
    localStorage.setItem(ADDRESSED_KEY, JSON.stringify(['id-1', 'id-2']));
    const result = getAddressedIds();
    expect(result.size).toBe(2);
    expect(result.has('id-1')).toBe(true);
    expect(result.has('id-2')).toBe(true);
  });

  it('filters out non-string elements', () => {
    localStorage.setItem(ADDRESSED_KEY, JSON.stringify(['id-1', 42, null, 'id-2']));
    const result = getAddressedIds();
    expect(result.size).toBe(2);
    expect(result.has('id-1')).toBe(true);
    expect(result.has('id-2')).toBe(true);
  });
});

// ── markAddressed ─────────────────────────────────────────────────────────────

describe('markAddressed', () => {
  it('is a no-op for empty array', () => {
    markAddressed([]);
    expect(localStorage.getItem(ADDRESSED_KEY)).toBeNull();
  });

  it('persists IDs on first call', () => {
    markAddressed(['id-1', 'id-2']);
    const stored = getAddressedIds();
    expect(stored.has('id-1')).toBe(true);
    expect(stored.has('id-2')).toBe(true);
  });

  it('accumulates IDs across multiple calls', () => {
    markAddressed(['id-1']);
    markAddressed(['id-2']);
    const stored = getAddressedIds();
    expect(stored.has('id-1')).toBe(true);
    expect(stored.has('id-2')).toBe(true);
  });

  it('deduplicates IDs', () => {
    markAddressed(['id-1', 'id-1', 'id-2']);
    const stored = getAddressedIds();
    expect(stored.size).toBe(2);
  });

  it('does not overwrite existing IDs', () => {
    markAddressed(['id-1']);
    markAddressed(['id-2']);
    const stored = getAddressedIds();
    expect(stored.has('id-1')).toBe(true);
  });
});

// ── isMigrationDisabled ───────────────────────────────────────────────────────

describe('isMigrationDisabled', () => {
  it('returns false when key does not exist', () => {
    expect(isMigrationDisabled()).toBe(false);
  });

  it('returns false when key has unexpected value', () => {
    localStorage.setItem(DISABLED_KEY, 'true');
    expect(isMigrationDisabled()).toBe(false);
  });

  it('returns true when key is "1"', () => {
    localStorage.setItem(DISABLED_KEY, '1');
    expect(isMigrationDisabled()).toBe(true);
  });
});

// ── disableMigration ──────────────────────────────────────────────────────────

describe('disableMigration', () => {
  it('sets the disabled flag so isMigrationDisabled returns true', () => {
    expect(isMigrationDisabled()).toBe(false);
    disableMigration();
    expect(isMigrationDisabled()).toBe(true);
  });

  it('is idempotent', () => {
    disableMigration();
    disableMigration();
    expect(isMigrationDisabled()).toBe(true);
  });
});
