import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from './api-client';
import { resolveApiBaseUrl } from './config';
import { createSession, type TokenStorage } from './session';

// Resolved per request so a server URL changed inside the app takes effect
// without a restart (see resolveApiBaseUrl).
const baseUrl = () => resolveApiBaseUrl();

// Android Keystore / iOS Keychain, never plain AsyncStorage (blueprint §16).
const secureStorage: TokenStorage = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) =>
    SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

/** The app-wide login session. */
export const session = createSession(createApiClient({ baseUrl }), secureStorage);

/** The app-wide API client: sends the access token and refreshes it when it expires. */
export const api = createApiClient({ baseUrl, auth: session });

export function useSession() {
  return useSyncExternalStore(session.subscribe, session.getState);
}
