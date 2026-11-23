import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 4000;

/**
 * Where the API lives.
 * 1. EXPO_PUBLIC_API_URL if set (e.g. a deployed server).
 * 2. In development: the bundle host on port 4000. On web, use the browser's
 *    current hostname; on native, use the Expo development server host.
 *    Works for browsers, emulators, and phones on the same Wi-Fi.
 */
export function resolveApiBaseUrl(
  explicitUrl: string | undefined = process.env.EXPO_PUBLIC_API_URL,
  devHostUri: string | undefined = Constants.expoConfig?.hostUri,
): string {
  if (explicitUrl) return explicitUrl.replace(/\/+$/, '');
  const host =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.hostname
      : devHostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}`;
  return `http://localhost:${API_PORT}`;
}
