import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from './api-client';
import { resolveApiBaseUrl } from './config';
import { createSession, type TokenStorage } from './session';

const baseUrl = resolveApiBaseUrl();

// SecureStore is native-only. Keep browser tokens in memory rather than persistent, script-readable storage.
const memoryTokenValues = new Map<string, string>();
const browserStorage: TokenStorage = {
  get: async (key) => memoryTokenValues.get(key) ?? null,
  set: async (key, value) => {
    memoryTokenValues.set(key, value);
  },
  remove: async (key) => {
    memoryTokenValues.delete(key);
  },
};

// On Android use the Keystore; on iOS use the Keychain (blueprint §16).
const nativeStorage: TokenStorage = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) =>
    SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: (key) => SecureStore.deleteItemAsync(key),
};
const tokenStorage = Platform.OS === 'web' ? browserStorage : nativeStorage;

/** The app-wide login session. */
export const session = createSession(createApiClient({ baseUrl }), tokenStorage);

/** The app-wide API client: sends the access token and refreshes it when it expires. */
export const api = createApiClient({ baseUrl, auth: session });

export function useSession() {
  return useSyncExternalStore(session.subscribe, session.getState);
}
