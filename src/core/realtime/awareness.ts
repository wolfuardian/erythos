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
  /** Viewport-space X coordinate */
  x: number;
  /** Viewport-space Y coordinate */
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
