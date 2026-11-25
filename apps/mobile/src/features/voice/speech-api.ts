import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { resolveApiBaseUrl } from '@/lib/config';

/** URL the audio player streams spoken audio from (Chatterbox TTS via the API). */
export function speechUrl(text: string): string {
  return `${resolveApiBaseUrl()}/v1/speech?text=${encodeURIComponent(text.trim())}`;
}

let current: AudioPlayer | null = null;

/**
 * Speaks `text` aloud through the Chatterbox TTS service. Resolves once playback
 * starts; rejects if the voice service is unreachable so the UI can show an error.
 * Replaces any audio already playing.
 */
export async function speak(text: string): Promise<void> {
  const body = text.trim();
  if (!body) return;

  // Confirm the service is reachable first, so an offline TTS surfaces as a clear
  // error instead of a silent no-op. ponytail: double-fetches short clips; fine here.
  const res = await fetch(speechUrl(body));
  if (!res.ok) throw new Error(`voice unavailable (${res.status})`);

  await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  current?.remove();
  current = createAudioPlayer({ uri: speechUrl(body) });
  current.play();
}

export function stopSpeaking(): void {
  current?.remove();
  current = null;
}
