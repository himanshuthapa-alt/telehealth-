import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from './api-client';
import { resolveApiBaseUrl } from './config';
import { createSession, type TokenStorage } from './session';

// Resolved per request so a server URL changed inside the app takes effect
// without a restart (see resolveApiBaseUrl).
const baseUrl = () => resolveApiBaseUrl();

// Android Keystore / iOS Keychain, never plain AsyncStorage (blueprint §16).
const nativeStorage: TokenStorage = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) =>
    SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

// Browsers have no keystore. sessionStorage ends with the tab, so a token never outlives it.
// ponytail: web is for staff dashboards and testing; use httpOnly cookies if patients ever use web
const webStorage: TokenStorage = {
  get: async (key) => globalThis.sessionStorage?.getItem(key) ?? null,
  set: async (key, value) => globalThis.sessionStorage?.setItem(key, value),
  remove: async (key) => globalThis.sessionStorage?.removeItem(key),
};

const secureStorage = Platform.OS === 'web' ? webStorage : nativeStorage;

/** The app-wide login session. */
export const session = createSession(createApiClient({ baseUrl }), secureStorage);

/** The app-wide API client: sends the access token and refreshes it when it expires. */
export const api = createApiClient({ baseUrl, auth: session });

export function useSession() {
  return useSyncExternalStore(session.subscribe, session.getState);
}
