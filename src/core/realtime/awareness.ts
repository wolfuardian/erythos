/**
 * awareness.ts
 *
 * Awareness payload schema for L3-A presence broadcast.
 *
 * Spec ref: docs/realtime-co-edit-spec.md § L3-A scope > Infra > Awareness state
 *
 * This schema is the single source of truth for the shape of data sent via
 * y-protocols awareness.  L3-A3 (viewport rendering) and L3-B (CRDT) must
 * import from here — do not inline the payload shape elsewhere.
 */

// ─── User identity (static per session) ─────────────────────────────────────

export interface AwarenessUser {
  /** Erythos user UUID */
  id: string;
  /** GitHub login (display name) */
  name: string;
  /** GitHub avatar URL or null if unavailable */
  avatarUrl: string | null;
  /**
   * Deterministic hex color assigned to this user.
   * Derived from user.id so the same user always maps to the same color
   * across reconnects.  Palette defined in RealtimeClient.colorForId().
   */
  color: string;
}

// ─── Cursor position (updated at 30 Hz) ─────────────────────────────────────

export interface AwarenessCursor {
  /**
   * Normalized X coordinate within the sender's viewport rect — value in [0, 1].
   * Sender divides `clientX` by the viewport container width; receiver multiplies by
   * 100 to obtain a CSS `left` percentage. Never in raw pixel units.
   */
  x: number;
  /**
   * Normalized Y coordinate within the sender's viewport rect — value in [0, 1].
   * Sender divides `clientY` by the viewport container height; receiver multiplies by
   * 100 to obtain a CSS `top` percentage. Never in raw pixel units.
   */
  y: number;
  /**
   * Which viewport the cursor is in.
   * null = cursor not in any tracked viewport (e.g. hovering a dialog).
   * L3-A3 is responsible for populating this field; RealtimeClient exposes
   * setCursor() so callers pass the value.
   */
  viewport: 'main' | 'scene-tree' | null;
}

// ─── Selection (updated on change, not throttled) ───────────────────────────

export interface AwarenessSelection {
  /** UUIDs of currently selected scene nodes */
  nodeIds: string[];
}

// ─── Full awareness state ────────────────────────────────────────────────────

export interface AwarenessState {
  user: AwarenessUser;
  cursor: AwarenessCursor;
  selection: AwarenessSelection;
}

/**
 * Represents a remote peer's awareness state as received from the server.
 * Keyed by Yjs clientId (integer assigned by Yjs per connection).
 */
export interface RemoteAwarenessEntry {
  clientId: number;
  state: AwarenessState;
}

// ─── Payload budget ────────────────────────────────────────────────────────────

/**
 * Maximum recommended JSON byte size for a single awareness state payload.
 *
 * Spec (§ L3-A > Awareness payload 預算) defines throttle rates but no
 * explicit byte limit.  8 KB is chosen as the warn threshold:
 *   - Normal payload (user + cursor + ~10 nodeIds) ≈ 200–500 bytes
 *   - 8 KB = clearly runaway (e.g. 1000+ nodeIds selected)
 *   - Well below typical WebSocket maxPayload defaults (1–16 MB)
 *
 * RealtimeClient calls warnIfAwarenessPayloadTooLarge() before every
 * setLocalState().  Threshold can be overridden for testing.
 *
 * Issue: #1067 (L3-A4)
 */
export const AWARENESS_PAYLOAD_WARN_BYTES = 8192;

/**
 * Warn via console.warn if the JSON-serialised awareness state exceeds
 * AWARENESS_PAYLOAD_WARN_BYTES.  Does NOT block the broadcast.
 *
 * Exported for unit testing.  RealtimeClient calls this before every
 * awareness.setLocalState().
 */
export function warnIfAwarenessPayloadTooLarge(
  state: AwarenessState,
  warnThreshold = AWARENESS_PAYLOAD_WARN_BYTES,
): void {
  const bytes = JSON.stringify(state).length;
  if (bytes > warnThreshold) {
    console.warn(
      `[RealtimeClient] awareness payload too large: ${bytes} bytes ` +
        `(threshold: ${warnThreshold} bytes). ` +
        `selection.nodeIds.length=${state.selection.nodeIds.length}`,
    );
  }
}
