/**
 * Error Code Registry — Erythos error taxonomy (refs #1025).
 *
 * Segment allocation:
 *   E1001–E1099   scene I/O  (UUID format, scene quota)
 *   E1100–E1199   sync / conflict
 *   E1200–E1299   asset                 (reserved for #1047)
 *   E1300–E1399   auth / session
 *   E1400–E1499   IO / file system
 *
 * Server-side codes (E1001–E1003) are owned by the server workspace.
 * They are listed here for taxonomy completeness only; do NOT cross-import
 * from server/ (separate tsconfig, separate build).
 *
 * Wire envelope — server responses:
 *   { error: "<human-readable>", code: "E#### ERR_SCREAMING_SNAKE" }
 *
 * Client display — use formatErrorMessage():
 *   `${human} (${code})`   e.g. "Scene shape invalid (E1004 ERR_SCENE_INVARIANT)"
 */

// ── Segment E1001–E1099: Scene I/O ───────────────────────────────────────────
//
// E1001 ERR_USER_ID_FORMAT        — server/src/middleware/validate-uuid.ts
// E1002 ERR_SCENE_ID_FORMAT       — server/src/middleware/validate-uuid.ts
// E1003 ERR_SCENE_QUOTA_EXCEEDED  — server/src/routes/scenes.ts

/** Invalid scene shape: one or more invariant violations. */
export const ERR_SCENE_INVARIANT = 'E1004 ERR_SCENE_INVARIANT' as const;

// ── Segment E1100–E1199: Sync / Conflict ─────────────────────────────────────

/** Scene body exceeds the server 1 MB size limit. */
export const ERR_SCENE_PAYLOAD_TOO_LARGE = 'E1101 ERR_SCENE_PAYLOAD_TOO_LARGE' as const;

// ── Segment E1200–E1299: Asset (reserved for #1047) ──────────────────────────

// ── Segment E1300–E1399: Auth / Session ──────────────────────────────────────

// ── Segment E1400–E1499: IO / File System ────────────────────────────────────

// ── Format helper ─────────────────────────────────────────────────────────────

/**
 * Format an error code + human-readable message into the standard display string.
 *
 * Matches the App.tsx display pattern (PR #1046/#1048):
 *   `${human} (${code})`
 *
 * Example:
 *   formatErrorMessage('E1004 ERR_SCENE_INVARIANT', 'Scene shape invalid')
 *   → 'Scene shape invalid (E1004 ERR_SCENE_INVARIANT)'
 */
export function formatErrorMessage(code: string, human: string): string {
  return `${human} (${code})`;
}
