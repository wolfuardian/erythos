import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthClient, AuthError, type User } from './AuthClient';

const BASE_URL = 'https://erythos.app/api';

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

function mockFetchNetworkError(message = 'Connection refused'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error(message)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── getCurrentUser ──────────────────────────────────────────────────────────

describe('AuthClient.getCurrentUser', () => {
  it('200 → returns mapped User', async () => {
    const serverPayload = {
      id: 'uuid-1',
      github_login: 'octocat',
      email: 'octocat@github.com',
      avatar_url: 'https://avatars.githubusercontent.com/u/1',
      storageUsed: 1024,
      is_admin: false,
      scheduled_delete_at: null,
    };
    mockFetch(200, serverPayload);

    const client = new AuthClient(BASE_URL);
    const user = await client.getCurrentUser();

    const expected: User = {
      id: 'uuid-1',
      githubLogin: 'octocat',
      email: 'octocat@github.com',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1',
      storageUsed: 1024,
      isAdmin: false,
      scheduledDeleteAt: null,
    };
    expect(user).toEqual(expected);
  });

  it('200 with scheduled_delete_at → scheduledDeleteAt is ISO string', async () => {
    mockFetch(200, {
      id: 'uuid-1',
      github_login: 'octocat',
      email: 'octocat@github.com',
      avatar_url: null,
      storageUsed: 0,
      is_admin: false,
      scheduled_delete_at: '2026-06-15T00:00:00.000Z',
    });

    const client = new AuthClient(BASE_URL);
    const user = await client.getCurrentUser();

    expect(user?.scheduledDeleteAt).toBe('2026-06-15T00:00:00.000Z');
  });

  it('200 with null avatar_url → avatarUrl is null', async () => {
    mockFetch(200, {
      id: 'uuid-2',
      github_login: 'ghost',
      email: 'ghost@example.com',
      avatar_url: null,
      storageUsed: 0,
    });

    const client = new AuthClient(BASE_URL);
    const user = await client.getCurrentUser();

    expect(user?.avatarUrl).toBeNull();
  });

  it('401 → returns null (anonymous), does not throw', async () => {
    mockFetch(401, null);

    const client = new AuthClient(BASE_URL);
    const user = await client.getCurrentUser();

    expect(user).toBeNull();
  });

  it('403 → returns null, does not throw', async () => {
    mockFetch(403, null);

    const client = new AuthClient(BASE_URL);
    const user = await client.getCurrentUser();

    expect(user).toBeNull();
  });

  it('500 → throws AuthError with status', async () => {
    mockFetch(500, { error: 'Internal Server Error' });

    const client = new AuthClient(BASE_URL);
    await expect(client.getCurrentUser()).rejects.toThrow(AuthError);
    await expect(client.getCurrentUser()).rejects.toMatchObject({ status: 500 });
  });

  it('network error → throws AuthError', async () => {
    mockFetchNetworkError('Connection refused');

    const client = new AuthClient(BASE_URL);
    await expect(client.getCurrentUser()).rejects.toThrow(AuthError);
    await expect(client.getCurrentUser()).rejects.toThrow('Network error');
  });

  it('calls correct endpoint with credentials: include', async () => {
    mockFetch(401, null);

    const client = new AuthClient(BASE_URL);
    await client.getCurrentUser();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${BASE_URL}/auth/me`,
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});

// ─── signOut ─────────────────────────────────────────────────────────────────

describe('AuthClient.signOut', () => {
  it('200 → resolves without throwing', async () => {
    mockFetch(200, null);

    const client = new AuthClient(BASE_URL);
    await expect(client.signOut()).resolves.toBeUndefined();
  });

  it('204 → resolves without throwing', async () => {
    mockFetch(204, null);

    const client = new AuthClient(BASE_URL);
    await expect(client.signOut()).resolves.toBeUndefined();
  });

  it('500 → throws AuthError', async () => {
    mockFetch(500, { error: 'Internal Server Error' });

    const client = new AuthClient(BASE_URL);
    await expect(client.signOut()).rejects.toThrow(AuthError);
  });

  it('calls POST /auth/signout with credentials: include', async () => {
    mockFetch(200, null);

    const client = new AuthClient(BASE_URL);
    await client.signOut();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${BASE_URL}/auth/signout`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});

// ─── getOAuthStartUrl ────────────────────────────────────────────────────────

describe('AuthClient.getOAuthStartUrl', () => {
  it("'github' → correct URL", () => {
    const client = new AuthClient(BASE_URL);
    expect(client.getOAuthStartUrl('github')).toBe(
      `${BASE_URL}/auth/github/start`,
    );
  });

  it('uses custom baseUrl when provided', () => {
    const client = new AuthClient('http://localhost:8080/api');
    expect(client.getOAuthStartUrl('github')).toBe(
      'http://localhost:8080/api/auth/github/start',
    );
  });
});

// ─── deleteAccount ────────────────────────────────────────────────────────────

describe('AuthClient.deleteAccount', () => {
  it('200 → resolves with scheduledDeleteAt', async () => {
    mockFetch(200, { scheduled_delete_at: '2026-06-15T00:00:00.000Z' });

    const client = new AuthClient(BASE_URL);
    const result = await client.deleteAccount();
    expect(result).toEqual({ scheduledDeleteAt: '2026-06-15T00:00:00.000Z' });
  });

  it('401 → throws AuthError with status 401', async () => {
    mockFetch(401, { error: 'Unauthorized' });

    const client = new AuthClient(BASE_URL);
    await expect(client.deleteAccount()).rejects.toThrow(AuthError);
    await expect(client.deleteAccount()).rejects.toMatchObject({ status: 401 });
  });

  it('403 → throws AuthError with status 403', async () => {
    mockFetch(403, { error: 'Forbidden' });

    const client = new AuthClient(BASE_URL);
    await expect(client.deleteAccount()).rejects.toThrow(AuthError);
    await expect(client.deleteAccount()).rejects.toMatchObject({ status: 403 });
  });

  it('500 → throws AuthError with status 500', async () => {
    mockFetch(500, { error: 'Internal Server Error' });

    const client = new AuthClient(BASE_URL);
    await expect(client.deleteAccount()).rejects.toThrow(AuthError);
    await expect(client.deleteAccount()).rejects.toMatchObject({ status: 500 });
  });

  it('network error → throws AuthError', async () => {
    mockFetchNetworkError('Connection refused');

    const client = new AuthClient(BASE_URL);
    await expect(client.deleteAccount()).rejects.toThrow(AuthError);
    await expect(client.deleteAccount()).rejects.toThrow('Network error');
  });

  it('calls DELETE /me with credentials: include', async () => {
    mockFetch(200, { scheduled_delete_at: '2026-06-15T00:00:00.000Z' });

    const client = new AuthClient(BASE_URL);
    await client.deleteAccount();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${BASE_URL}/me`,
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });
});

// ─── requestMagicLink ────────────────────────────────────────────────────────

describe('AuthClient.requestMagicLink', () => {
  it('200 → resolves without error', async () => {
    mockFetch(200, { ok: true });

    const client = new AuthClient(BASE_URL);
    await expect(
      client.requestMagicLink('alice@example.com'),
    ).resolves.toBeUndefined();
  });

  it('400 → throws AuthError with status 400 and invalid-email message', async () => {
    mockFetch(400, { error: 'invalid_email' });

    const client = new AuthClient(BASE_URL);
    await expect(client.requestMagicLink('not-an-email')).rejects.toThrow(
      AuthError,
    );
    await expect(client.requestMagicLink('not-an-email')).rejects.toMatchObject(
      { status: 400, message: expect.stringContaining('valid email') },
    );
  });

  it('429 → throws AuthError with status 429 and rate-limit message', async () => {
    mockFetch(429, { error: 'rate_limited' });

    const client = new AuthClient(BASE_URL);
    await expect(
      client.requestMagicLink('flood@example.com'),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining('Too many'),
    });
  });

  it('500 → throws AuthError with status 500', async () => {
    mockFetch(500, { error: 'Internal Server Error' });

    const client = new AuthClient(BASE_URL);
    await expect(
      client.requestMagicLink('alice@example.com'),
    ).rejects.toMatchObject({ status: 500 });
  });

  it('network error → throws AuthError with network-error message', async () => {
    mockFetchNetworkError('Connection refused');

    const client = new AuthClient(BASE_URL);
    await expect(
      client.requestMagicLink('alice@example.com'),
    ).rejects.toThrow('Network error');
  });

  it('POSTs to /auth/magic-link/request with email body + credentials include', async () => {
    mockFetch(200, { ok: true });

    const client = new AuthClient(BASE_URL);
    await client.requestMagicLink('alice@example.com');

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${BASE_URL}/auth/magic-link/request`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      }),
    );
  });
});
