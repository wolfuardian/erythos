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
    };
    mockFetch(200, serverPayload);

    const client = new AuthClient(BASE_URL);
    const user = await client.getCurrentUser();

    const expected: User = {
      id: 'uuid-1',
      githubLogin: 'octocat',
      email: 'octocat@github.com',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1',
    };
    expect(user).toEqual(expected);
  });

  it('200 with null avatar_url → avatarUrl is null', async () => {
    mockFetch(200, {
      id: 'uuid-2',
      github_login: 'ghost',
      email: 'ghost@example.com',
      avatar_url: null,
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
  it('204 → resolves without throwing', async () => {
    mockFetch(204, null);

    const client = new AuthClient(BASE_URL);
    await expect(client.deleteAccount()).resolves.toBeUndefined();
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
    mockFetch(204, null);

    const client = new AuthClient(BASE_URL);
    await client.deleteAccount();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${BASE_URL}/me`,
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });
});
