import Constants from 'expo-constants';

const API_PORT = 4000;

/**
 * Where the API lives.
 * 1. EXPO_PUBLIC_API_URL if set (e.g. a deployed server).
 * 2. In development: the same machine that serves the JS bundle, on port 4000.
 *    Works for the emulator and for a physical phone on the same Wi-Fi.
 */
export function resolveApiBaseUrl(
  explicitUrl: string | undefined = process.env.EXPO_PUBLIC_API_URL,
  devHostUri: string | undefined = Constants.expoConfig?.hostUri,
): string {
  if (explicitUrl) return explicitUrl.replace(/\/+$/, '');
  const host = devHostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}`;
  return `http://localhost:${API_PORT}`;
}
