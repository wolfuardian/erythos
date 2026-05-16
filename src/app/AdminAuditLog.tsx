/**
 * AdminAuditLog — G2-3 (refs #1088)
 *
 * Admin-only page for querying the audit log.
 * Rendered by App.tsx when URL pathname === '/admin/audit-log' and current
 * user has is_admin === true. Not a SPA route — full-page nav is used instead
 * of a router lib (minimum diff, admin-only low-frequency view).
 *
 * Endpoint: GET /api/admin/audit-log (protected by requireAdmin middleware)
 * Pagination: keyset via next_cursor (forward-only infinite scroll / load-more)
 */

import {
  type Component,
  createSignal,
  For,
  Show,
} from 'solid-js';
import { defaultBaseUrl } from '../core/sync/baseUrl';
import styles from './AdminAuditLog.module.css';

// ---------------------------------------------------------------------------
// Event type closed set — sync with server/src/routes/admin.ts AUDIT_EVENT_TYPES
// Source of truth is the server constant; this list mirrors it for the select UI.
// Update both when new event types are wired.
// ---------------------------------------------------------------------------

const AUDIT_EVENT_TYPES = [
  'auth.signin.success',
  'auth.signin.failure',
  'auth.signout',
  'auth.magic_link.request',
  'auth.magic_link.consume',
  'scene.create',
  'scene.delete',
  'share_token.create',
  'share_token.revoke',
  'user.data_export',
  'user.account_delete',
  'admin.access_denied',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditEntry {
  id: string;
  timestamp: string;
  event_type: string;
  actor_id: string | null;
  actor_ip: string;
  actor_ua: string | null;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  success: boolean;
}

interface AuditLogResponse {
  rows: AuditEntry[];
  next_cursor: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortId(id: string | null): string {
  if (!id) return '—';
  return id.slice(0, 8);
}

function resourceCell(type: string | null, id: string | null): string {
  if (!type) return '—';
  if (!id) return type;
  return `${type}:${id.slice(0, 8)}`;
}

function metadataPreview(meta: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(meta);
    return s.length > 80 ? s.slice(0, 80) + '…' : s;
  } catch {
    return '{}';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AdminAuditLog: Component = () => {
  const apiBase = defaultBaseUrl();

  // Filter state
  const [filterEventType, setFilterEventType] = createSignal('');
  const [filterActorId, setFilterActorId] = createSignal('');
  const [filterFrom, setFilterFrom] = createSignal('');
  const [filterTo, setFilterTo] = createSignal('');
  const [filterLimit, setFilterLimit] = createSignal('100');

  // Results state
  const [rows, setRows] = createSignal<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [searched, setSearched] = createSignal(false);

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------

  function buildUrl(cursor?: string): string {
    const params = new URLSearchParams();
    if (filterEventType()) params.set('event_type', filterEventType());
    if (filterActorId()) params.set('actor_id', filterActorId());
    if (filterFrom()) params.set('from', filterFrom());
    if (filterTo()) params.set('to', filterTo());
    const limitVal = parseInt(filterLimit(), 10);
    if (!isNaN(limitVal) && limitVal > 0) params.set('limit', String(limitVal));
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString();
    return `${apiBase}/admin/audit-log${qs ? '?' + qs : ''}`;
  }

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setRows([]);
    setNextCursor(null);
    setSearched(true);

    try {
      const res = await fetch(buildUrl(), { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `Server error: ${res.status}`);
      }
      const data = await res.json() as AuditLogResponse;
      setRows(data.rows);
      setNextCursor(data.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    const cursor = nextCursor();
    if (!cursor || loadingMore()) return;

    setLoadingMore(true);
    setError(null);

    try {
      const res = await fetch(buildUrl(cursor), { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `Server error: ${res.status}`);
      }
      const data = await res.json() as AuditLogResponse;
      setRows((prev) => [...prev, ...data.rows]);
      setNextCursor(data.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleReset = () => {
    setFilterEventType('');
    setFilterActorId('');
    setFilterFrom('');
    setFilterTo('');
    setFilterLimit('100');
    setRows([]);
    setNextCursor(null);
    setError(null);
    setSearched(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div class={styles.root}>
      {/* Header */}
      <div class={styles.header}>
        <a href="/" class={styles.headerBack}>← Back to editor</a>
        <h1 class={styles.headerTitle}>Audit Log</h1>
      </div>

      {/* Filter form */}
      <form
        class={styles.filterForm}
        onSubmit={(e) => { e.preventDefault(); void handleSearch(); }}
      >
        <div class={styles.filterGroup}>
          <label class={styles.filterLabel}>Event type</label>
          <select
            class={styles.filterSelect}
            value={filterEventType()}
            onInput={(e) => setFilterEventType(e.currentTarget.value)}
          >
            <option value="">All</option>
            <For each={AUDIT_EVENT_TYPES}>
              {(type) => <option value={type}>{type}</option>}
            </For>
          </select>
        </div>

        <div class={styles.filterGroup}>
          <label class={styles.filterLabel}>Actor ID</label>
          <input
            class={styles.filterInput}
            type="text"
            placeholder="UUID"
            value={filterActorId()}
            onInput={(e) => setFilterActorId(e.currentTarget.value)}
          />
        </div>

        <div class={styles.filterGroup}>
          <label class={styles.filterLabel}>From</label>
          <input
            class={styles.filterInput}
            type="datetime-local"
            value={filterFrom()}
            onInput={(e) => {
              const v = e.currentTarget.value;
              setFilterFrom(v ? new Date(v).toISOString() : '');
            }}
          />
        </div>

        <div class={styles.filterGroup}>
          <label class={styles.filterLabel}>To</label>
          <input
            class={styles.filterInput}
            type="datetime-local"
            value={filterTo()}
            onInput={(e) => {
              const v = e.currentTarget.value;
              setFilterTo(v ? new Date(v).toISOString() : '');
            }}
          />
        </div>

        <div class={styles.filterGroup}>
          <label class={styles.filterLabel}>Limit</label>
          <input
            class={styles.filterInput}
            type="number"
            min="1"
            max="1000"
            value={filterLimit()}
            onInput={(e) => setFilterLimit(e.currentTarget.value)}
            style={{ width: '70px' }}
          />
        </div>

        <div class={styles.filterActions}>
          <button type="submit" class={styles.filterButton} disabled={loading()}>
            {loading() ? 'Loading…' : 'Search'}
          </button>
          <button type="button" class={styles.filterButtonSecondary} onClick={handleReset}>
            Reset
          </button>
        </div>
      </form>

      {/* Loading / error states */}
      <Show when={loading()}>
        <div role="status" class={styles.loading}>Loading…</div>
      </Show>
      <Show when={error() !== null}>
        <div role="alert" class={styles.error}>{error()}</div>
      </Show>

      {/* Results */}
      <div class={styles.content}>
        <Show when={searched() && !loading() && rows().length === 0 && error() === null}>
          <div class={styles.empty}>No results.</div>
        </Show>

        <Show when={rows().length > 0}>
          <table class={styles.table}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Event type</th>
                <th>Resource</th>
                <th>Metadata</th>
                <th>OK</th>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(row) => (
                  <tr>
                    <td title={row.timestamp}>
                      {new Date(row.timestamp).toLocaleString()}
                    </td>
                    <td title={row.actor_id ?? '—'}>
                      {shortId(row.actor_id)}
                    </td>
                    <td>{row.event_type}</td>
                    <td title={`${row.resource_type ?? '—'}:${row.resource_id ?? '—'}`}>
                      {resourceCell(row.resource_type, row.resource_id)}
                    </td>
                    <td title={JSON.stringify(row.metadata)}>
                      {metadataPreview(row.metadata)}
                    </td>
                    <td class={row.success ? styles.cellSuccess : styles.cellFailure}>
                      {row.success ? '✓' : '✗'}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>

      {/* Load more */}
      <Show when={nextCursor() !== null}>
        <div class={styles.loadMoreArea}>
          <button
            class={styles.loadMoreButton}
            onClick={() => void handleLoadMore()}
            disabled={loadingMore()}
          >
            {loadingMore() ? 'Loading…' : 'Load more'}
          </button>
        </div>
      </Show>
    </div>
  );
};

export { AdminAuditLog };
