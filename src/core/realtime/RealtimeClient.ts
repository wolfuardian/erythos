/**
 * RealtimeClient.ts
 *
 * L3-A real-time presence client.  Wraps @hocuspocus/provider to provide:
 *
 *   1. Awareness state broadcast (user / cursor / selection)
 *   2. 30 Hz client-side cursor throttle (33 ms tick)
 *   3. On-change selection broadcast (no throttle)
 *   4. SolidJS signals for connection status — consumed by L3-A3 (viewport UI)
 *   5. Awareness rebroadcast on reconnect (L3-A4)
 *   6. Payload size budget warning (L3-A4)
 *
 * Y.Doc is empty in L3-A (awareness-transport only).  CRDT scene writes
 * are deferred to L3-B.
 *
 * Auth note: the session cookie is HttpOnly — JS cannot read it.  We pass
 * `token: null` and rely on the browser sending the cookie automatically
 * on the WebSocket upgrade handshake (SameSite=Lax, same origin or
 * Caddy-proxied subpath).  The server's onAuthenticate hook falls back to
 * parsing the Cookie header when `token` is empty.
 *
 * Reconnect rebroadcast (L3-A4):
 *   HocusPocus provider already calls startSync() → sends awareness on
 *   reconnect if localState !== null.  We additionally subscribe to
 *   onAuthenticated (fires after server auth handshake completes) to guarantee
 *   that our full localState is pushed even on reconnect edge cases where the
 *   provider's internal rebroadcast might not include our latest state.
 *
 * Payload budget (L3-A4):
 *   Spec (§ L3-A > Awareness payload 預算) defines throttle rates but no
 *   explicit byte limit.  We use 8 KB (8192 bytes) as the warn threshold:
 *   a normal awareness payload (user + cursor + ~10 nodeIds) is ~200–500 bytes;
 *   8 KB signals clearly runaway selection state (1000+ nodeIds).  This is far
 *   below typical WebSocket maxPayload defaults (1–16 MB).  Adjust via
 *   AWARENESS_PAYLOAD_WARN_BYTES if needed.
 *
 * Spec ref: docs/realtime-co-edit-spec.md § L3-A scope > Client integration
 * Issue: #1067 (L3-A4 polish)
 */

import * as Y from 'yjs';
import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import { createSignal, type Accessor } from 'solid-js';
import type { User } from '../auth/AuthClient';
import { realtimeUrl } from './realtimeUrl';
import { throttle } from '../../utils/throttle';
import type { AwarenessState, RemoteAwarenessEntry } from './awareness';
import { warnIfAwarenessPayloadTooLarge } from './awareness';

// ─── Color palette ───────────────────────────────────────────────────────────

/**
 * Deterministic palette: hash user.id → index → hex color.
 * Using a fixed list keeps colors stable across reconnects.
 */
const COLOR_PALETTE = [
  '#F87171', // red-400
  '#FB923C', // orange-400
  '#FBBF24', // amber-400
  '#A3E635', // lime-400
  '#34D399', // emerald-400
  '#22D3EE', // cyan-400
  '#60A5FA', // blue-400
  '#A78BFA', // violet-400
  '#F472B6', // pink-400
  '#E879F9', // fuchsia-400
];

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

// ─── Connection status type ──────────────────────────────────────────────────

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

// ─── RealtimeClient ──────────────────────────────────────────────────────────

export class RealtimeClient {
  private readonly provider: HocuspocusProvider;
  private readonly doc: Y.Doc;
  private readonly throttledBroadcastCursor: ReturnType<typeof throttle<[x: number, y: number, viewport: 'main' | 'scene-tree' | null]>>;

  // SolidJS signals for connection/auth status
  private readonly _status: Accessor<ConnectionStatus>;
  private readonly _setStatus: (s: ConnectionStatus) => void;

  // SolidJS signal for remote awareness states (peers only, not local)
  private readonly _remoteStates: Accessor<RemoteAwarenessEntry[]>;
  private readonly _setRemoteStates: (entries: RemoteAwarenessEntry[]) => void;

  // Local awareness state (mutable, merged into provider.awareness)
  private localState: AwarenessState;

  /**
   * @param sceneId  The UUID of the scene to connect to (used as documentName
   *                 on the HocusPocus server).
   * @param user     The currently authenticated user.  Must not be null —
   *                 callers should guard on currentUser() before constructing.
   */
  constructor(sceneId: string, user: User) {
    this.doc = new Y.Doc();

    // Initial local awareness state — cursor starts at origin, no selection
    this.localState = {
      user: {
        id: user.id,
        name: user.githubLogin,
        avatarUrl: user.avatarUrl,
        color: colorForId(user.id),
      },
      cursor: { x: 0, y: 0, viewport: null },
      selection: { nodeIds: [] },
    };

    // SolidJS signals
    const [status, setStatus] = createSignal<ConnectionStatus>('connecting');
    this._status = status;
    this._setStatus = setStatus;

    const [remoteStates, setRemoteStates] = createSignal<RemoteAwarenessEntry[]>([]);
    this._remoteStates = remoteStates;
    this._setRemoteStates = setRemoteStates;

    // Throttled cursor broadcast: 30 Hz = 33 ms
    this.throttledBroadcastCursor = throttle(
      (x: number, y: number, viewport: 'main' | 'scene-tree' | null) => {
        this.localState = {
          ...this.localState,
          cursor: { x, y, viewport },
        };
        warnIfAwarenessPayloadTooLarge(this.localState);
        this.provider.awareness?.setLocalState(this.localState);
      },
      33,
    );

    // Build WS URL: `ws://localhost:3001/<sceneId>` (dev)
    //               `wss://erythos.app/realtime/<sceneId>` (prod)
    const url = `${realtimeUrl()}/${sceneId}`;

    this.provider = new HocuspocusProvider({
      url,
      name: sceneId,
      document: this.doc,
      // token: null — browser sends the HttpOnly session cookie automatically
      // on the WS upgrade handshake (SameSite=Lax).  The server falls back to
      // parsing the Cookie header in onAuthenticate when token is empty.
      token: null,
      onStatus: ({ status }: { status: WebSocketStatus }) => {
        if (status === WebSocketStatus.Connected) {
          this._setStatus('connected');
        } else if (status === WebSocketStatus.Connecting) {
          this._setStatus('connecting');
        } else {
          this._setStatus('disconnected');
        }
      },
      // L3-A4 reconnect rebroadcast:
      // onAuthenticated fires after the server completes the auth handshake,
      // which happens on every connect including reconnects.  At this point
      // the WebSocket is confirmed live and authenticated, so we push the full
      // localState to guarantee remote peers see us after any reconnect.
      //
      // HocusPocus provider's own startSync() also broadcasts awareness on
      // reconnect (if localState !== null), but onAuthenticated is the safer
      // hook because it fires strictly after auth — not just WS open.
      onAuthenticated: () => {
        warnIfAwarenessPayloadTooLarge(this.localState);
        this.provider.awareness?.setLocalState(this.localState);
      },
      onDisconnect: () => {
        this._setStatus('disconnected');
      },
      onAwarenessChange: ({ states }: { states: Array<{ clientId: number; [key: string]: unknown }> }) => {
        const localClientId = this.provider.awareness?.clientID;
        const entries: RemoteAwarenessEntry[] = [];
        for (const s of states) {
          // Skip our own local state
          if (s.clientId === localClientId) continue;
          // Only include states that have the expected shape
          if (s.user && s.cursor && s.selection) {
            entries.push({
              clientId: s.clientId,
              state: s as unknown as AwarenessState,
            });
          }
        }
        this._setRemoteStates(entries);
      },
    });
  }

  // ─── Public accessors (SolidJS signals) ───────────────────────────────────

  /** Reactive connection status signal for L3-A3 viewport subscription. */
  get status(): Accessor<ConnectionStatus> {
    return this._status;
  }

  /** Reactive remote peer awareness states (local client excluded). */
  get remoteStates(): Accessor<RemoteAwarenessEntry[]> {
    return this._remoteStates;
  }

  // ─── Public mutation API ──────────────────────────────────────────────────

  /**
   * Broadcast cursor position at ≤30 Hz (throttled).
   * Called from the viewport mouse-move handler in L3-A3.
   *
   * @param x        Viewport-space X coordinate
   * @param y        Viewport-space Y coordinate
   * @param viewport Which viewport the cursor is in, or null
   */
  setCursor(x: number, y: number, viewport: 'main' | 'scene-tree' | null): void {
    this.throttledBroadcastCursor(x, y, viewport);
  }

  /**
   * Broadcast selection change immediately (on-change, not throttled).
   * Called from the editor selection handler in L3-A3.
   *
   * @param nodeIds Array of selected scene node UUIDs
   */
  setSelection(nodeIds: string[]): void {
    this.localState = {
      ...this.localState,
      selection: { nodeIds },
    };
    warnIfAwarenessPayloadTooLarge(this.localState);
    this.provider.awareness?.setLocalState(this.localState);
  }

  /**
   * Update the local user info (e.g. after avatar changes).
   * Rarely needed — user info is set on construction.
   */
  setUser(user: User): void {
    this.localState = {
      ...this.localState,
      user: {
        id: user.id,
        name: user.githubLogin,
        avatarUrl: user.avatarUrl,
        color: colorForId(user.id),
      },
    };
    warnIfAwarenessPayloadTooLarge(this.localState);
    this.provider.awareness?.setLocalState(this.localState);
  }

  /**
   * Expose the underlying awareness instance for advanced use (e.g. L3-B
   * direct Y.Doc access).  Prefer the typed setters above for L3-A3.
   */
  get awareness() {
    return this.provider.awareness;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Destroy the provider and clean up all subscriptions.
   * Call when the user closes the scene or signs out.
   */
  destroy(): void {
    this.throttledBroadcastCursor.cancel();
    // Clear local awareness before disconnecting so peers see us leave immediately
    this.provider.awareness?.setLocalState(null);
    this.provider.destroy();
    this.doc.destroy();
  }
}
