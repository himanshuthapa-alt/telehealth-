import { isApiErrorBody, type ErrorCode } from '@telecare/shared';

/** Why a request failed, in terms the UI can act on (blueprint §18). */
export type ApiFailure =
  | { kind: 'offline' }
  | { kind: 'timeout' }
  | {
      kind: 'http';
      status: number;
      code: ErrorCode | 'UNKNOWN';
      requestId?: string;
      /** Per-field messages for VALIDATION_FAILED (and a few other codes). */
      fields?: Record<string, string>;
    };

export class ApiError extends Error {
  constructor(readonly failure: ApiFailure) {
    super(failure.kind === 'http' ? `HTTP ${failure.status} ${failure.code}` : failure.kind);
    this.name = 'ApiError';
  }
}

/** How the client authenticates. Provided by the session (src/lib/session.ts). */
export interface ClientAuth {
  accessToken(): string | null;
  /** Gets a new access token. Rejects (and ends the session) if that is impossible. */
  refresh(): Promise<void>;
}

export interface RequestOptions {
  /** Overrides the client's timeout, e.g. for a long poll that waits on purpose. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  /** A URL, or a resolver called per request (so a runtime server change is picked up). */
  baseUrl: string | (() => string);
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  auth?: ClientAuth;
}

/**
 * Thin wrapper over fetch: base URL, JSON, timeout, error normalisation and,
 * with `auth`, the bearer token plus one silent refresh-and-retry on 401.
 */
export function createApiClient({ baseUrl, timeoutMs = 15_000, fetchImpl = fetch, auth }: ApiClientOptions) {
  async function request<T>(path: string, init: RequestInit = {}, opts: RequestOptions = {}): Promise<T> {
    try {
      return await send<T>(path, init, opts);
    } catch (err) {
      const expired =
        err instanceof ApiError && err.failure.kind === 'http' && err.failure.code === 'UNAUTHENTICATED';
      if (!auth || !expired) throw err;
      await auth.refresh();
      return send<T>(path, init, opts);
    }
  }

  async function send<T>(path: string, init: RequestInit, opts: RequestOptions): Promise<T> {
    const token = auth?.accessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? timeoutMs);
    // The caller can cancel too (e.g. a long poll when the screen closes).
    opts.signal?.addEventListener('abort', () => controller.abort());
    let res: Response;
    try {
      const base = typeof baseUrl === 'function' ? baseUrl() : baseUrl;
      res = await fetchImpl(`${base}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...init.headers,
        },
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(controller.signal.aborted ? { kind: 'timeout' } : { kind: 'offline' });
    } finally {
      clearTimeout(timer);
    }

    const body: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const error = isApiErrorBody(body) ? body.error : undefined;
      const fields = (error?.details as { fields?: Record<string, string> } | undefined)?.fields;
      throw new ApiError({
        kind: 'http',
        status: res.status,
        code: error?.code ?? 'UNKNOWN',
        requestId: error?.requestId,
        ...(fields && { fields }),
      });
    }
    return body as T;
  }

  return {
    get baseUrl() {
      return typeof baseUrl === 'function' ? baseUrl() : baseUrl;
    },
    get: <T>(path: string, opts?: RequestOptions) => request<T>(path, {}, opts),
    post: <T = void>(path: string, body?: unknown, headers?: Record<string, string>) =>
      request<T>(path, {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
        headers,
      }),
    /** POST a non-JSON body (recorded audio). */
    upload: <T>(path: string, body: Blob, contentType: string) =>
      request<T>(
        path,
        { method: 'POST', body, headers: { 'Content-Type': contentType } },
        { timeoutMs: 40_000 },
      ),
    patch: <T>(path: string, body: unknown) =>
      request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
    put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (path: string) => request<void>(path, { method: 'DELETE' }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
