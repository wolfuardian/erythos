/**
 * anonMigrateState — localStorage helpers for Anonymous → Registered migration prompt.
 *
 * Tracks which local project entries have been "addressed" (either migrated,
 * skipped, or user chose "Skip all").
 *
 * Keys:
 *   - `anon_migrate_addressed`: JSON array of entry.id strings
 *   - `migrate_prompt_disabled`: "1" when user clicks "Skip all (don't ask again)"
 *
 * Design notes:
 *   - localStorage is per-device (no user_id anchor while anonymous). Cross-device
 *     re-prompt is an accepted trade-off.
 *   - After upgrade via the per-project Upload button (#1053), the entry.id is NOT
 *     automatically added here — users who previously upgraded may be prompted again.
 *     Re-upgrading is harmless (content-addressed assets; creates a duplicate cloud
 *     scene). Documented in issue #1054 PR Notes.
 *   - To reset for testing: clear `anon_migrate_addressed` and `migrate_prompt_disabled`
 *     from localStorage.
 *
 * Refs: #1054
 */

const ADDRESSED_KEY = 'anon_migrate_addressed';
const DISABLED_KEY = 'migrate_prompt_disabled';

/** Returns the set of project entry IDs that have already been addressed. */
export function getAddressedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(ADDRESSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

/** Marks one or more project entry IDs as addressed (migration attempted or skipped). */
export function markAddressed(ids: string[]): void {
  if (ids.length === 0) return;
  try {
    const current = getAddressedIds();
    for (const id of ids) current.add(id);
    localStorage.setItem(ADDRESSED_KEY, JSON.stringify([...current]));
  } catch {
    // localStorage disabled — silently skip (prompt may appear again, acceptable)
  }
}

/** Returns true when the user has clicked "Skip all (don't ask again)". */
export function isMigrationDisabled(): boolean {
  try {
    return localStorage.getItem(DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Sets the global "never prompt again" flag. */
export function disableMigration(): void {
  try {
    localStorage.setItem(DISABLED_KEY, '1');
  } catch {
    // localStorage disabled — best-effort
  }
}
