import { ApiError, createApiClient } from './api-client';
import { resolveApiBaseUrl } from './config';

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ApiError) return err.failure;
    throw err;
  }
  throw new Error('expected the request to fail');
}

describe('api client', () => {
  it('returns parsed JSON on success', async () => {
    const api = createApiClient({ baseUrl: 'http://api', fetchImpl: () => json(200, { status: 'ok' }) });
    await expect(api.get('/health')).resolves.toEqual({ status: 'ok' });
  });

  it('maps an API error body to its error code and request id', async () => {
    const api = createApiClient({
      baseUrl: 'http://api',
      fetchImpl: () => json(404, { error: { code: 'NOT_FOUND', message: 'x', requestId: 'req-1' } }),
    });
    expect(await failureOf(api.get('/x'))).toEqual({
      kind: 'http',
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'req-1',
    });
  });

  it('reports non-API error bodies as UNKNOWN', async () => {
    const api = createApiClient({
      baseUrl: 'http://api',
      fetchImpl: () => json(502, '<html>bad gateway</html>'),
    });
    expect(await failureOf(api.get('/x'))).toMatchObject({ kind: 'http', status: 502, code: 'UNKNOWN' });
  });

  it('reports network failures as offline', async () => {
    const api = createApiClient({
      baseUrl: 'http://api',
      fetchImpl: () => Promise.reject(new TypeError('Network request failed')),
    });
    expect(await failureOf(api.get('/x'))).toEqual({ kind: 'offline' });
  });

  it('reports slow responses as timeout', async () => {
    const neverResolves: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    const api = createApiClient({ baseUrl: 'http://api', timeoutMs: 10, fetchImpl: neverResolves });
    expect(await failureOf(api.get('/x'))).toEqual({ kind: 'timeout' });
  });
});

describe('resolveApiBaseUrl', () => {
  it('prefers an explicit URL and trims trailing slashes', () => {
    expect(resolveApiBaseUrl('https://api.example.org/', '192.168.1.5:8081')).toBe('https://api.example.org');
  });

  it('uses the dev server host on port 4000 in development', () => {
    expect(resolveApiBaseUrl(undefined, '192.168.1.5:8081')).toBe('http://192.168.1.5:4000');
  });

  it('falls back to localhost', () => {
    expect(resolveApiBaseUrl(undefined, undefined)).toBe('http://localhost:4000');
  });
});
