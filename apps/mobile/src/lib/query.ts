import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Network from 'expo-network';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager, onlineManager, type Query } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import { ApiError } from './api-client';
import { session } from './api';

/** Retry only what may succeed a second time: no network, timeout, server errors. Never 4xx. */
export function shouldRetry(failureCount: number, err: unknown): boolean {
  if (failureCount >= 2 || !(err instanceof ApiError)) return false;
  return err.failure.kind !== 'http' || err.failure.status >= 500;
}

/**
 * The app-wide query cache: cached data shows instantly and refreshes in the
 * background (blueprint §17). Only public directory data (keys starting with
 * PUBLIC_CACHE_KEY) is also saved to disk; health data stays in memory.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry, staleTime: 30_000 },
    // Writes are never retried automatically (no idempotency keys yet).
    mutations: { retry: false },
  },
});

/** Query keys starting with this are public, non-sensitive data that may be saved to disk for offline use. */
export const PUBLIC_CACHE_KEY = 'doctors';

/** How long saved public data is kept, on disk and in memory. Use as `gcTime` on public queries. */
export const PUBLIC_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const shouldPersistQuery = (query: Pick<Query, 'queryKey' | 'state'>) =>
  query.queryKey[0] === PUBLIC_CACHE_KEY && query.state.status === 'success';

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister: createAsyncStoragePersister({ storage: AsyncStorage, key: 'telecare.publicCache' }),
  maxAge: PUBLIC_CACHE_MAX_AGE,
  // A new app version starts with a fresh cache, so old shapes never reach new code.
  buster: Constants.expoConfig?.version ?? '',
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
};

/** Wires the cache to the device: pause while offline, refetch on reconnect / app resume, wipe on logout. */
export function connectQueryClient(): () => void {
  onlineManager.setEventListener((setOnline) => {
    const sub = Network.addNetworkStateListener((state) =>
      setOnline(state.isConnected !== false && state.isInternetReachable !== false),
    );
    return () => sub.remove();
  });
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
  return session.subscribe(() => {
    if (session.getState().status === 'signedOut') queryClient.clear();
  });
}
