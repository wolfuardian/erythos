/**
 * Unit tests for audit/recordAudit.ts — G2-1 (refs #1086)
 *
 * Covered:
 *   recordAudit() — happy path (db.insert called with expected shape)
 *   recordAudit() — DB error swallowed (promise resolves, logger.error called)
 *   maskEmail()   — correct masking format (first char + sha256 first-8-hex of rest)
 *   maskEmail()   — empty string input
 *   extractActorIp() — first XFF entry
 *   extractActorIp() — fallback when header absent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Mocks — must be registered before module-under-test import
// ---------------------------------------------------------------------------

const mockInsert = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    insert: mockInsert,
  },
  pool: {},
}));

const mockLoggerError = vi.fn();

vi.mock('../middleware/logger.js', () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
  },
  loggerMiddleware: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const { recordAudit, maskEmail, extractActorIp } = await import('../audit/recordAudit.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Hono-shaped context stub for extractActorIp tests */
function makeContext(xff?: string): { req: { header: (name: string) => string | undefined } } {
  return {
    req: {
      header: (name: string) => {
        if (name === 'X-Forwarded-For') return xff;
        return undefined;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('maskEmail', () => {
  it('returns first char + first-8-hex of sha256(rest)', () => {
    const email = 'alice@example.com';
    const expected = 'a' + createHash('sha256').update('lice@example.com').digest('hex').slice(0, 8);
    expect(maskEmail(email)).toBe(expected);
  });

  it('handles single-char email gracefully (empty rest)', () => {
    const result = maskEmail('a');
    // first char 'a', rest is '', sha256('') first 8 hex
    const expected = 'a' + createHash('sha256').update('').digest('hex').slice(0, 8);
    expect(result).toBe(expected);
  });

  it('returns empty string for empty input', () => {
    expect(maskEmail('')).toBe('');
  });
});

describe('extractActorIp', () => {
  it('returns first entry of X-Forwarded-For', () => {
    const c = makeContext('1.2.3.4, 5.6.7.8, 9.10.11.12');
    expect(extractActorIp(c as never)).toBe('1.2.3.4');
  });

  it('trims whitespace from the first entry', () => {
    const c = makeContext('  10.0.0.1 , 192.168.1.1');
    expect(extractActorIp(c as never)).toBe('10.0.0.1');
  });

  it('returns empty string when X-Forwarded-For is absent', () => {
    const c = makeContext(undefined);
    expect(extractActorIp(c as never)).toBe('');
  });
});

describe('recordAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: chain insert().values() resolves
    const mockValues = vi.fn().mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('calls db.insert with expected shape on happy path', async () => {
    await recordAudit('scene.create', {
      actor_id: 'user-uuid-1',
      actor_ip: '1.2.3.4',
      actor_ua: 'Mozilla/5.0',
      resource_type: 'scene',
      resource_id: 'scene-uuid-1',
      metadata: { title: 'My Scene' },
      success: true,
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    const valuesCall = mockInsert.mock.results[0]?.value?.values;
    expect(valuesCall).toHaveBeenCalledWith({
      event_type: 'scene.create',
      actor_id: 'user-uuid-1',
      actor_ip: '1.2.3.4',
      actor_ua: 'Mozilla/5.0',
      resource_type: 'scene',
      resource_id: 'scene-uuid-1',
      metadata: { title: 'My Scene' },
      success: true,
    });
  });

  it('uses null defaults for optional fields when omitted', async () => {
    await recordAudit('auth.signin.failure', {
      actor_id: null,
      actor_ip: '5.5.5.5',
      success: false,
    });

    const valuesCall = mockInsert.mock.results[0]?.value?.values;
    expect(valuesCall).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: null,
        actor_ua: null,
        resource_type: null,
        resource_id: null,
        metadata: {},
        success: false,
      }),
    );
  });

  it('swallows DB errors and still resolves the promise', async () => {
    const mockValues = vi.fn().mockRejectedValue(new Error('DB connection lost'));
    mockInsert.mockReturnValue({ values: mockValues });

    // Must not throw
    await expect(
      recordAudit('scene.delete', {
        actor_id: 'user-uuid-2',
        actor_ip: '2.3.4.5',
        success: true,
      }),
    ).resolves.toBeUndefined();

    expect(mockLoggerError).toHaveBeenCalledOnce();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), event_type: 'scene.delete' }),
      'audit: failed to write event',
    );
  });

  it('does not call logger.error on success', async () => {
    await recordAudit('auth.signout', {
      actor_id: 'u1',
      actor_ip: '1.1.1.1',
      success: true,
    });

    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});
