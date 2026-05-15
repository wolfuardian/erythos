/**
 * Unit tests for awareness payload budget warning (L3-A4).
 *
 * Spec ref: docs/realtime-co-edit-spec.md § L3-A > Awareness payload 預算
 * Issue: #1067 (L3-A4)
 *
 * Tests:
 *   - Normal payload does NOT warn
 *   - Oversized payload (1000+ nodeIds) DOES warn via console.warn
 *   - warnIfAwarenessPayloadTooLarge is a pure function; threshold is adjustable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { warnIfAwarenessPayloadTooLarge, AWARENESS_PAYLOAD_WARN_BYTES } from '../awareness';
import type { AwarenessState } from '../awareness';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeState(nodeIdCount: number): AwarenessState {
  return {
    user: {
      id: 'user-uuid-1234',
      name: 'testuser',
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
      color: '#F87171',
    },
    cursor: { x: 123.45, y: 678.9, viewport: 'main' },
    selection: {
      nodeIds: Array.from({ length: nodeIdCount }, (_, i) => `node-uuid-${i.toString().padStart(8, '0')}`),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('warnIfAwarenessPayloadTooLarge', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('does NOT warn for a normal payload (0 nodeIds)', () => {
    const state = makeState(0);
    warnIfAwarenessPayloadTooLarge(state);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('does NOT warn for a moderate payload (~10 nodeIds)', () => {
    const state = makeState(10);
    warnIfAwarenessPayloadTooLarge(state);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('warns when payload exceeds AWARENESS_PAYLOAD_WARN_BYTES (1000+ nodeIds)', () => {
    // 1000 nodeIds each ~26 chars + overhead → well over 8 KB threshold
    const state = makeState(1000);
    const payloadBytes = JSON.stringify(state).length;
    expect(payloadBytes).toBeGreaterThan(AWARENESS_PAYLOAD_WARN_BYTES);

    warnIfAwarenessPayloadTooLarge(state);

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    const warnMessage: string = consoleWarnSpy.mock.calls[0][0];
    expect(warnMessage).toContain('[RealtimeClient] awareness payload too large');
    expect(warnMessage).toContain(`${payloadBytes} bytes`);
    expect(warnMessage).toContain('selection.nodeIds.length=1000');
  });

  it('does NOT warn when payload is exactly at the threshold', () => {
    // Use a tiny custom threshold to test boundary without needing a huge payload
    const state = makeState(0);
    const bytes = JSON.stringify(state).length;
    // threshold = bytes means we're at the limit, not over it — should NOT warn
    warnIfAwarenessPayloadTooLarge(state, bytes);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('warns when payload is one byte over a custom threshold', () => {
    const state = makeState(0);
    const bytes = JSON.stringify(state).length;
    // threshold = bytes - 1 means we're one byte over — should warn
    warnIfAwarenessPayloadTooLarge(state, bytes - 1);
    expect(consoleWarnSpy).toHaveBeenCalledOnce();
  });

  it('AWARENESS_PAYLOAD_WARN_BYTES is 8192 (8 KB)', () => {
    expect(AWARENESS_PAYLOAD_WARN_BYTES).toBe(8192);
  });
});
