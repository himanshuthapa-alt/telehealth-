import type { AuthSession } from '@telecare/shared';
import { ApiError, createApiClient } from './api-client';
import { createSession, type TokenStorage } from './session';

const user = { id: 'u1', phone: '+919000000001', fullName: 'Asha', role: 'PATIENT' as const };
const sessionBody = (n: number): AuthSession => ({
  user,
  accessToken: `access-${n}`,
  accessTokenExpiresIn: 900,
  refreshToken: `refresh-${n}`,
});

const json = (status: number, body?: unknown) =>
  Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));

function memoryStorage(
  initial: Record<string, string> = {},
): TokenStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => void (data[k] = v),
    remove: async (k) => void delete data[k],
  };
}

/** A fake server: routes by path, records every call. */
function fakeServer(routes: Record<string, (init: RequestInit) => Promise<Response>>) {
  const calls: { path: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = url.replace('http://api', '');
    calls.push({ path, init });
    const route = routes[path];
    return route ? route(init) : json(404, { error: { code: 'NOT_FOUND', message: 'x' } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const signedInStorage = () =>
  memoryStorage({ 'telecare.refreshToken': 'refresh-0', 'telecare.user': JSON.stringify(user) });

describe('session', () => {
  it('starts signed out when nothing is stored', async () => {
    const { fetchImpl } = fakeServer({});
    const session = createSession(createApiClient({ baseUrl: 'http://api', fetchImpl }), memoryStorage());
    await session.restore();
    expect(session.getState()).toEqual({ status: 'signedOut' });
  });

  it('login stores the refresh token securely and keeps the access token in memory', async () => {
    const { fetchImpl } = fakeServer({ '/v1/auth/login': () => json(200, sessionBody(1)) });
    const storage = memoryStorage();
    const session = createSession(createApiClient({ baseUrl: 'http://api', fetchImpl }), storage);
    await session.login({ phone: user.phone, password: 'x' });
    expect(session.getState()).toEqual({ status: 'signedIn', user });
    expect(session.accessToken()).toBe('access-1');
    expect(storage.data['telecare.refreshToken']).toBe('refresh-1');
    expect(JSON.stringify(storage.data)).not.toContain('access-1');
  });

  it('resumes a saved session by refreshing', async () => {
    const { fetchImpl } = fakeServer({ '/v1/auth/refresh': () => json(200, sessionBody(1)) });
    const storage = signedInStorage();
    const session = createSession(createApiClient({ baseUrl: 'http://api', fetchImpl }), storage);
    await session.restore();
    expect(session.getState()).toEqual({ status: 'signedIn', user });
    expect(storage.data['telecare.refreshToken']).toBe('refresh-1');
  });

  it('stays signed in with the saved profile when offline at startup', async () => {
    const fetchImpl = (() => Promise.reject(new TypeError('Network request failed'))) as typeof fetch;
    const session = createSession(createApiClient({ baseUrl: 'http://api', fetchImpl }), signedInStorage());
    await session.restore();
    expect(session.getState()).toEqual({ status: 'signedIn', user });
  });

  it('signs out as expired when the server rejects the refresh token', async () => {
    const { fetchImpl } = fakeServer({
      '/v1/auth/refresh': () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }),
    });
    const storage = signedInStorage();
    const session = createSession(createApiClient({ baseUrl: 'http://api', fetchImpl }), storage);
    await session.adopt(sessionBody(0));
    await expect(session.refresh()).rejects.toBeInstanceOf(ApiError);
    expect(session.getState()).toEqual({ status: 'signedOut', expired: true });
    expect(storage.data).toEqual({});
  });

  it('shares one refresh between concurrent callers', async () => {
    const { calls, fetchImpl } = fakeServer({ '/v1/auth/refresh': () => json(200, sessionBody(1)) });
    const session = createSession(createApiClient({ baseUrl: 'http://api', fetchImpl }), signedInStorage());
    await Promise.all([session.refresh(), session.refresh(), session.refresh()]);
    expect(calls.filter((c) => c.path === '/v1/auth/refresh')).toHaveLength(1);
  });

  it('logout clears storage even when the server is unreachable', async () => {
    const fetchImpl = (() => Promise.reject(new TypeError('offline'))) as typeof fetch;
    const storage = signedInStorage();
    const session = createSession(createApiClient({ baseUrl: 'http://api', fetchImpl }), storage);
    await session.logout();
    expect(session.getState()).toEqual({ status: 'signedOut' });
    expect(storage.data).toEqual({});
  });
});

describe('authenticated api client', () => {
  it('sends the access token, and on 401 refreshes once and retries', async () => {
    let meCalls = 0;
    const { calls, fetchImpl } = fakeServer({
      '/v1/auth/refresh': () => json(200, sessionBody(2)),
      '/v1/me': (init) => {
        meCalls += 1;
        const authHeader = (init.headers as Record<string, string>).Authorization;
        return authHeader === 'Bearer access-2'
          ? json(200, user)
          : json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } });
      },
    });
    const session = createSession(createApiClient({ baseUrl: 'http://api', fetchImpl }), signedInStorage());
    await session.adopt(sessionBody(1));
    const api = createApiClient({ baseUrl: 'http://api', fetchImpl, auth: session });

    await expect(api.get('/v1/me')).resolves.toEqual(user);
    expect(meCalls).toBe(2);
    expect(calls.map((c) => c.path)).toEqual(['/v1/me', '/v1/auth/refresh', '/v1/me']);
  });

  it('does not refresh on other errors such as a wrong current password', async () => {
    const { calls, fetchImpl } = fakeServer({
      '/v1/auth/password/change': () => json(400, { error: { code: 'INVALID_CREDENTIALS', message: 'x' } }),
    });
    const session = createSession(createApiClient({ baseUrl: 'http://api', fetchImpl }), signedInStorage());
    const api = createApiClient({ baseUrl: 'http://api', fetchImpl, auth: session });
    await expect(api.post('/v1/auth/password/change', {})).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it('passes per-field validation messages through', async () => {
    const { fetchImpl } = fakeServer({
      '/v1/auth/register': () =>
        json(400, {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'x',
            details: { fields: { phone: 'Enter a valid number' } },
          },
        }),
    });
    const api = createApiClient({ baseUrl: 'http://api', fetchImpl });
    const err = await api.post('/v1/auth/register', {}).catch((e: unknown) => e);
    expect((err as ApiError).failure).toMatchObject({ fields: { phone: 'Enter a valid number' } });
  });
});
