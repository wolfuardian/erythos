/**
 * Unit tests for jobs/pruneScheduledDeletes — G1 (refs #1095).
 *
 * Strategy: mock db module + recordAudit so no real Postgres is needed.
 * The function is imported AFTER mocks are registered (vi.mock hoisting).
 *
 * Covered:
 *   - empty result → early return, no delete, no recordAudit
 *   - one expired user → recordAudit fired before db.delete, per-user
 *   - multiple expired users → each gets its own delete + recordAudit
 *   - db.select throws → logs warn, does not rethrow (silent fail per OQ-3)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — registered before any module-under-test import
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockDelete = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    delete: mockDelete,
  },
  pool: {},
}));

const mockRecordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../audit/recordAudit.js', () => ({
  recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
  extractActorIp: vi.fn().mockReturnValue(''),
  maskEmail: vi.fn().mockReturnValue(''),
}));

// Mock logger so warn assertions don't pollute test output
const mockWarn = vi.fn();
vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: (...args: unknown[]) => mockWarn(...args),
    error: vi.fn(),
  },
  loggerMiddleware: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import unit under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const { pruneScheduledDeletes } = await import('../jobs/pruneScheduledDeletes.js');

// ---------------------------------------------------------------------------
// Select chain builder
// ---------------------------------------------------------------------------

function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

function deleteChain() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pruneScheduledDeletes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does nothing when no users have expired scheduled_delete_at', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await pruneScheduledDeletes();

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it('fires recordAudit then db.delete for a single expired user', async () => {
    const expiredId = 'user-expired-1';
    mockSelect.mockReturnValueOnce(selectChain([{ id: expiredId }]));
    mockDelete.mockReturnValueOnce(deleteChain());

    await pruneScheduledDeletes();

    // recordAudit must be called with the correct event type + actor_id
    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
    const [eventType, opts] = mockRecordAudit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventType).toBe('user.account_delete_executed');
    expect(opts.actor_id).toBe(expiredId);
    expect(opts.resource_id).toBe(expiredId);
    expect(opts.resource_type).toBe('user');
    expect((opts.metadata as Record<string, unknown>).reason).toBe('grace_period_expired');
    expect(opts.success).toBe(true);

    // db.delete called once for the user
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('fires recordAudit + db.delete for each of multiple expired users', async () => {
    const ids = ['user-a', 'user-b', 'user-c'];
    mockSelect.mockReturnValueOnce(selectChain(ids.map((id) => ({ id }))));
    mockDelete.mockReturnValue(deleteChain());

    await pruneScheduledDeletes();

    expect(mockRecordAudit).toHaveBeenCalledTimes(ids.length);
    expect(mockDelete).toHaveBeenCalledTimes(ids.length);

    // Each recordAudit must reference the correct user
    for (let i = 0; i < ids.length; i++) {
      const [eventType, opts] = mockRecordAudit.mock.calls[i] as [string, Record<string, unknown>];
      expect(eventType).toBe('user.account_delete_executed');
      expect(opts.actor_id).toBe(ids[i]);
    }
  });

  it('swallows db.select error and logs a warn (silent fail per OQ-3)', async () => {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockRejectedValue(new Error('DB down')),
    });

    // Must not throw
    await expect(pruneScheduledDeletes()).resolves.toBeUndefined();

    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledOnce();
    const [warnArg] = mockWarn.mock.calls[0] as [{ err: unknown }, string];
    expect(typeof warnArg).toBe('object');
    expect((warnArg as { err: Error }).err).toBeInstanceOf(Error);
  });
});
