/**
 * ShareTokenClient.ts
 *
 * HTTP client for the share-token endpoints (G5, refs #1012).
 * Spec: docs/cloud-project-spec.md § REST API § Share token endpoints
 *
 * POST   /api/scenes/:id/share-tokens        — generate token (owner only)
 * GET    /api/scenes/:id/share-tokens        — list all tokens (owner only, incl revoked)
 * DELETE /api/scenes/:id/share-tokens/:tok  — revoke token (owner only, idempotent)
 */

import { defaultBaseUrl } from './baseUrl';

// ─── Domain types ────────────────────────────────────────────────────────────

export interface ShareToken {
  token: string;
  created_at: string;  // ISO 8601
  revoked_at: string | null;
}

export interface GeneratedToken {
  token: string;
  url: string;
  created_at: string;
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class ShareTokenError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ShareTokenError';
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class ShareTokenClient {
  constructor(private readonly baseUrl: string = defaultBaseUrl()) {}

  /**
   * Generate a new share token for the given scene.
   *
   * POST /api/scenes/:id/share-tokens
   *   201 → GeneratedToken
   *   401 → throws ShareTokenError (unauthorized)
   *   404 → throws ShareTokenError (scene not found or caller not owner)
   */
  async generate(sceneId: string): Promise<GeneratedToken> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/scenes/${sceneId}/share-tokens`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      throw new ShareTokenError(`Network error: ${(err as Error).message}`);
    }

    if (response.status === 401) {
      throw new ShareTokenError('Unauthorized', 401);
    }
    if (response.status === 404) {
      throw new ShareTokenError('Scene not found or not owner', 404);
    }
    if (!response.ok) {
      throw new ShareTokenError(
        `Unexpected response from POST share-tokens: ${response.status}`,
        response.status,
      );
    }

    return (await response.json()) as GeneratedToken;
  }

  /**
   * List all share tokens for the given scene (including revoked).
   *
   * GET /api/scenes/:id/share-tokens
   *   200 → { tokens: ShareToken[] }
   *   401 → throws ShareTokenError
   *   404 → throws ShareTokenError
   */
  async list(sceneId: string): Promise<ShareToken[]> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/scenes/${sceneId}/share-tokens`, {
        credentials: 'include',
      });
    } catch (err) {
      throw new ShareTokenError(`Network error: ${(err as Error).message}`);
    }

    if (response.status === 401) {
      throw new ShareTokenError('Unauthorized', 401);
    }
    if (response.status === 404) {
      throw new ShareTokenError('Scene not found or not owner', 404);
    }
    if (!response.ok) {
      throw new ShareTokenError(
        `Unexpected response from GET share-tokens: ${response.status}`,
        response.status,
      );
    }

    const data = (await response.json()) as { tokens: ShareToken[] };
    return data.tokens;
  }

  /**
   * Revoke a share token. Idempotent — already-revoked token returns without error.
   *
   * DELETE /api/scenes/:id/share-tokens/:token
   *   204 → resolves
   *   401 → throws ShareTokenError
   *   404 → throws ShareTokenError (scene not found, not owner, or token not found)
   */
  async revoke(sceneId: string, token: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/scenes/${sceneId}/share-tokens/${token}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch (err) {
      throw new ShareTokenError(`Network error: ${(err as Error).message}`);
    }

    if (response.status === 401) {
      throw new ShareTokenError('Unauthorized', 401);
    }
    if (response.status === 404) {
      throw new ShareTokenError('Scene, token not found, or not owner', 404);
    }
    if (response.status !== 204) {
      throw new ShareTokenError(
        `Unexpected response from DELETE share-token: ${response.status}`,
        response.status,
      );
    }
  }
}
