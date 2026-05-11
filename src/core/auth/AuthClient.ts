/**
 * AuthClient.ts
 *
 * Thin HTTP client for the Erythos auth API (Phase D).
 * Session is managed via HttpOnly cookie — no token storage in JS.
 *
 * Default base URL is resolved from the `VITE_SYNC_BASE_URL` env variable
 * (see `../sync/baseUrl.ts`).  Production falls back to
 * `https://erythos.eoswolf.com`; dev to `http://localhost:3000`.
 *
 * Spec refs: docs/sync-protocol.md §認證實作, §OAuth flow, §users schema.
 */

import { defaultBaseUrl } from '../sync/baseUrl';

// ─── Domain types ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  githubLogin: string;
  email: string;
  avatarUrl: string | null;
  /** Storage used in bytes, from server /api/auth/me (refs #957). */
  storageUsed: number;
}

// ─── Error class ─────────────────────────────────────────────────────────────

/**
 * Thrown when the server returns a 5xx status or a network error occurs.
 * 401 / 403 are NOT AuthErrors — they indicate anonymous state (→ null).
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class AuthClient {
  constructor(private readonly baseUrl: string = defaultBaseUrl()) {}

  /**
   * Returns the currently authenticated user, or null for anonymous / guest.
   *
   * GET /auth/me
   *   200 → User JSON
   *   401 → anonymous (returns null, does not throw)
   *   5xx → throws AuthError
   */
  async getCurrentUser(): Promise<User | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/auth/me`, {
        credentials: 'include',
      });
    } catch (err) {
      throw new AuthError(`Network error: ${(err as Error).message}`);
    }

    if (response.status === 401 || response.status === 403) {
      return null;
    }

    if (!response.ok) {
      throw new AuthError(
        `Unexpected response from /auth/me: ${response.status}`,
        response.status,
      );
    }

    const data = (await response.json()) as {
      id: string;
      github_login: string;
      email: string;
      avatar_url: string | null;
      storageUsed: number;
    };

    return {
      id: data.id,
      githubLogin: data.github_login,
      email: data.email,
      avatarUrl: data.avatar_url,
      storageUsed: data.storageUsed ?? 0,
    };
  }

  /**
   * Signs the current user out by invalidating their session server-side.
   *
   * POST /auth/signout
   *   200/204 → resolves
   *   5xx → throws AuthError
   */
  async signOut(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/auth/signout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      throw new AuthError(`Network error: ${(err as Error).message}`);
    }

    if (!response.ok) {
      throw new AuthError(
        `Unexpected response from /auth/signout: ${response.status}`,
        response.status,
      );
    }
  }

  /**
   * Returns the URL that starts the OAuth flow for the given provider.
   * The browser should navigate to (or open in a popup) this URL.
   * The server handles the provider redirect and callback cookie.
   *
   * Spec: OAuth flow → `Sign in with GitHub` → redirect to github.com → ...
   */
  getOAuthStartUrl(provider: 'github'): string {
    return `${this.baseUrl}/auth/${provider}/start`;
  }

  /**
   * Returns the URL for downloading the current user's data export.
   * The browser navigates directly to this URL; the server sets
   * Content-Disposition: attachment so the browser triggers a download.
   *
   * GET /api/me/export
   */
  getExportUrl(): string {
    return `${this.baseUrl}/me/export`;
  }

  /**
   * Permanently deletes the current user's account, all scenes, and revision
   * history. The server clears the session cookie on success.
   *
   * DELETE /api/me
   *   204 → resolves
   *   non-204 → throws AuthError
   *
   * Spec refs: docs/sync-protocol.md § GDPR, #932
   */
  async deleteAccount(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/me`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch (err) {
      throw new AuthError(`Network error: ${(err as Error).message}`);
    }

    if (response.status !== 204) {
      throw new AuthError(
        `Unexpected response from DELETE /api/me: ${response.status}`,
        response.status,
      );
    }
  }
}
