/**
 * AuthClient.ts
 *
 * Thin HTTP client for the Erythos auth API (Phase D).
 * Session is managed via HttpOnly cookie — no token storage in JS.
 *
 * Spec refs: docs/sync-protocol.md §認證實作, §OAuth flow, §users schema.
 */

// ─── Domain types ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  githubLogin: string;
  email: string;
  avatarUrl: string | null;
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
  constructor(private readonly baseUrl: string = 'https://erythos.app/api') {}

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
    };

    return {
      id: data.id,
      githubLogin: data.github_login,
      email: data.email,
      avatarUrl: data.avatar_url,
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
}
