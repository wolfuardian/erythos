/**
 * mockAuth.ts
 *
 * v0 stub auth — in-memory only.
 * Real GitHub OAuth integration is deferred to Phase D (cloud engine).
 *
 * Interface is aligned with AuthClient (src/core/auth/AuthClient.ts) so
 * the swap on Phase D is a one-line import change.
 *
 * Owner heuristic used by App:
 *   URL has sceneId AND local SyncEngine.fetch(id) succeeds → owner (or locally cached scene).
 *   URL has sceneId AND fetch throws NotFoundError              → guest / viewer mode.
 */

import type { User } from '../core/auth/AuthClient';

// Re-export User as AuthUser for any future consumers that prefer the local name.
export type { User };
export type AuthUser = User;

let _currentUser: User | null = null;

/**
 * Returns the current authenticated user, or null for anonymous/guest.
 *
 * v0: always returns null (anonymous). Phase D will wire real AuthClient here.
 * Signature mirrors AuthClient.getCurrentUser (async) for drop-in swap.
 */
export async function getCurrentUser(): Promise<User | null> {
  return _currentUser;
}

/**
 * Stub — no-op in mock mode. Phase D will call the real API.
 */
export async function signOut(): Promise<void> {
  _currentUser = null;
}

/**
 * Returns the URL that would start the OAuth flow.
 * In mock mode this URL is never actually visited.
 */
export function getOAuthStartUrl(provider: 'github'): string {
  return `https://erythos.app/api/auth/${provider}/start`;
}

// ─── Dev / test hooks ────────────────────────────────────────────────────────

/**
 * Inject a mock user without real OAuth.
 * Available in dev and test environments only — do not call in production code.
 */
export function _devSetUser(user: User | null): void {
  _currentUser = user;
}

/**
 * Alias kept for backward compatibility with any existing test/dev code
 * that calls _setCurrentUser.
 *
 * @deprecated use _devSetUser instead
 */
export const _setCurrentUser = _devSetUser;
