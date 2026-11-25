import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_PORT = 4000;
const STORAGE_KEY = 'telecare.apiBaseUrl';

// A server URL the user set inside the app (wins over everything). Loaded once
// at startup by loadStoredApiBaseUrl(); kept in a module var so resolveApiBaseUrl
// stays synchronous.
let overrideUrl: string | undefined;

/**
 * Where the API lives, in priority order:
 * 1. A URL the user saved in the app (so a changed tunnel URL needs no rebuild).
 * 2. EXPO_PUBLIC_API_URL baked at build time (e.g. a deployed server or tunnel).
 * 3. In development: the machine that serves the JS bundle, on port 4000.
 */
export function resolveApiBaseUrl(
  explicitUrl: string | undefined = process.env.EXPO_PUBLIC_API_URL,
  devHostUri: string | undefined = Constants.expoConfig?.hostUri,
): string {
  if (overrideUrl) return overrideUrl;
  if (explicitUrl) return explicitUrl.replace(/\/+$/, '');
  const host = devHostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}`;
  return `http://localhost:${API_PORT}`;
}

/** The build-time default (ignores any saved override), shown as a hint in settings. */
export function defaultApiBaseUrl(): string {
  const saved = overrideUrl;
  overrideUrl = undefined;
  const url = resolveApiBaseUrl();
  overrideUrl = saved;
  return url;
}

/** Load the saved server URL at startup, before any request is made. */
export async function loadStoredApiBaseUrl(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (v) overrideUrl = v.replace(/\/+$/, '');
  } catch {
    // AsyncStorage can throw in some environments; fall back to the baked URL.
  }
}

/** Save (or clear, with null) the server URL. Takes effect on the next request. */
export async function setStoredApiBaseUrl(url: string | null): Promise<void> {
  const clean = url?.trim().replace(/\/+$/, '') || undefined;
  overrideUrl = clean;
  try {
    if (clean) await AsyncStorage.setItem(STORAGE_KEY, clean);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort; the in-memory override still applies for this session.
  }
}
