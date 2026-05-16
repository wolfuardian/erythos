/**
 * anonMigrateState — localStorage helpers for Anonymous → Registered migration prompt.
 *
 * Tracks which local project entries have been "addressed" (either migrated,
 * skipped, or user chose "Skip all").
 *
 * Keys:
 *   - `anon_migrate_addressed`: JSON array of entry.id strings
 *   - `migrate_prompt_disabled`: "1" when user clicks "Skip all (don't ask again)"
 *   - `local_to_cloud_map`: JSON Record<entryId, sceneId> — written after a successful
 *     per-entry upload so the batch dialog can detect already-migrated entries and
 *     avoid creating a duplicate cloud scene. Fixes #1082.
 *
 * Design notes:
 *   - localStorage is per-device (no user_id anchor while anonymous). Cross-device
 *     re-prompt is an accepted trade-off.
 *   - After upgrade via the per-project Upload button (#1053), the entry.id is NOT
 *     automatically added to `addressed` — users who previously upgraded may be
 *     prompted again. `local_to_cloud_map` now records that mapping so the batch
 *     dialog can show an "Already uploaded" badge and skip re-uploading.
 *   - To reset for testing: clear `anon_migrate_addressed`, `migrate_prompt_disabled`,
 *     and `local_to_cloud_map` from localStorage.
 *
 * Refs: #1054, #1082
 */

const ADDRESSED_KEY = 'anon_migrate_addressed';
const DISABLED_KEY = 'migrate_prompt_disabled';
const MIGRATED_MAP_KEY = 'local_to_cloud_map';

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

// ── Per-entry cloud mapping (#1082) ───────────────────────────────────────────

/** Reads the full entryId → sceneId mapping from localStorage. */
function readMigratedMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MIGRATED_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    // Keep only string → string entries
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string') result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Records that a local project entry was successfully uploaded to a cloud scene.
 * Called after syncEngine.create() returns a sceneId. Idempotent — re-uploading
 * the same entry overwrites the sceneId with the latest value.
 *
 * Refs: #1082
 */
export function markEntryMigrated(entryId: string, sceneId: string): void {
  try {
    const map = readMigratedMap();
    map[entryId] = sceneId;
    localStorage.setItem(MIGRATED_MAP_KEY, JSON.stringify(map));
  } catch {
    // localStorage disabled — best-effort
  }
}

/**
 * Returns the cloud sceneId that the given local entry was migrated to,
 * or null if no mapping is recorded.
 *
 * Refs: #1082
 */
export function getMigratedSceneId(entryId: string): string | null {
  const map = readMigratedMap();
  return map[entryId] ?? null;
}

/**
 * Returns the set of entryIds that have a recorded cloud migration.
 * Convenience helper for the batch dialog to compute migrated badges.
 *
 * Refs: #1082
 */
export function getMigratedEntryIds(): Set<string> {
  return new Set(Object.keys(readMigratedMap()));
}

/**
 * Clears the entire entryId → sceneId mapping.
 * Intended for test helpers and dev tooling only — not wired to any UI.
 *
 * Refs: #1082
 */
export function clearMigratedMapping(): void {
  try {
    localStorage.removeItem(MIGRATED_MAP_KEY);
  } catch {
    // localStorage disabled — no-op
  }
}
