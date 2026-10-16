import type { AuthSession, AuthUser, LoginRequest, RegisterRequest } from '@telecare/shared';
import { ApiError, type ApiClient, type ClientAuth } from './api-client';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; /** true when the server ended the session, not the user */ expired?: boolean }
  | { status: 'signedIn'; user: AuthUser };

/** Where the refresh token lives. In the app this is the Android Keystore / iOS Keychain. */
export interface TokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const REFRESH_TOKEN_KEY = 'telecare.refreshToken';
const USER_KEY = 'telecare.user';

const isAuthRejection = (err: unknown) =>
  err instanceof ApiError && err.failure.kind === 'http' && err.failure.status === 401;

/**
 * The login session. The access token is kept only in memory; the refresh
 * token and the user's basic profile go to secure storage.
 * `publicApi` must be a client *without* auth (it calls the auth endpoints).
 */
export function createSession(publicApi: ApiClient, storage: TokenStorage) {
  let state: SessionState = { status: 'loading' };
  let accessToken: string | null = null;
  let refreshing: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function setState(next: SessionState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  async function adopt(session: AuthSession) {
    accessToken = session.accessToken;
    await storage.set(REFRESH_TOKEN_KEY, session.refreshToken);
    await storage.set(USER_KEY, JSON.stringify(session.user));
    setState({ status: 'signedIn', user: session.user });
  }

  async function clear(expired: boolean) {
    accessToken = null;
    await storage.remove(REFRESH_TOKEN_KEY);
    await storage.remove(USER_KEY);
    setState(expired ? { status: 'signedOut', expired } : { status: 'signedOut' });
  }

  /** One refresh at a time: concurrent 401s share it, so a token is never rotated twice. */
  function refresh(): Promise<void> {
    refreshing ??= (async () => {
      const refreshToken = await storage.get(REFRESH_TOKEN_KEY);
      try {
        if (!refreshToken) throw new ApiError({ kind: 'http', status: 401, code: 'UNAUTHENTICATED' });
        await adopt(await publicApi.post<AuthSession>('/v1/auth/refresh', { refreshToken }));
      } catch (err) {
        if (isAuthRejection(err)) await clear(state.status === 'signedIn');
        throw err;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  const auth: ClientAuth = { accessToken: () => accessToken, refresh };

  return {
    ...auth,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** On app start: resume the saved session. */
    async restore() {
      const [refreshToken, cachedUser] = await Promise.all([
        storage.get(REFRESH_TOKEN_KEY),
        storage.get(USER_KEY),
      ]);
      if (!refreshToken || !cachedUser) return clear(false);
      try {
        await refresh();
      } catch (err) {
        // No network or server trouble: stay signed in with the saved profile.
        // The next API call refreshes the token once the connection is back.
        if (!isAuthRejection(err)) setState({ status: 'signedIn', user: JSON.parse(cachedUser) as AuthUser });
      }
    },

    async login(body: LoginRequest) {
      await adopt(await publicApi.post<AuthSession>('/v1/auth/login', body));
    },

    async register(body: RegisterRequest) {
      await adopt(await publicApi.post<AuthSession>('/v1/auth/register', body));
    },

    /** Signs out locally at once; telling the server is best effort (works offline too). */
    async logout() {
      const refreshToken = await storage.get(REFRESH_TOKEN_KEY);
      await clear(false);
      if (refreshToken) publicApi.post('/v1/auth/logout', { refreshToken }).catch(() => undefined);
    },

    /** Replaces the session with one the server just issued (e.g. after a password change). */
    adopt,

    /** Keeps the saved user in step after a profile edit (e.g. a new name). */
    async updateUser(changes: Partial<Pick<AuthUser, 'fullName'>>) {
      if (state.status !== 'signedIn') return;
      const user = { ...state.user, ...changes };
      await storage.set(USER_KEY, JSON.stringify(user));
      setState({ status: 'signedIn', user });
    },
  };
}

export type Session = ReturnType<typeof createSession>;
