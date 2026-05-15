/**
 * src/core/realtime — L3-A real-time presence module
 *
 * Public API surface for L3-A2.  L3-A3 (viewport UI) imports from here.
 *
 * Spec ref: docs/realtime-co-edit-spec.md § L3-A scope > Client integration
 */
export { RealtimeClient } from './RealtimeClient';
export type { ConnectionStatus } from './RealtimeClient';
export type { AwarenessState, AwarenessUser, AwarenessCursor, AwarenessSelection, RemoteAwarenessEntry } from './awareness';
export { warnIfAwarenessPayloadTooLarge, AWARENESS_PAYLOAD_WARN_BYTES } from './awareness';
export { realtimeUrl } from './realtimeUrl';
