/**
 * mockAuth.ts
 *
 * v0 stub auth — in-memory only.
 * Real GitHub OAuth integration is deferred to Phase D (cloud engine).
 *
 * Owner heuristic used by App:
 *   URL has sceneId AND local SyncEngine.fetch(id) succeeds → owner (or locally cached scene).
 *   URL has sceneId AND fetch throws NotFoundError              → guest / viewer mode.
 */
export interface AuthUser {
  id: string;
}

let _currentUser: AuthUser | null = null;

/**
 * Returns the current authenticated user, or null for anonymous/guest.
 *
 * v0: always returns null (anonymous). Phase D will wire real auth here.
 */
export function getCurrentUser(): AuthUser | null {
  return _currentUser;
}

/** Test/dev helper — inject a mock user without real OAuth. */
export function _setCurrentUser(user: AuthUser | null): void {
  _currentUser = user;
}
