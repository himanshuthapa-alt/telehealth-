import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { resolveApiBaseUrl } from '@/lib/config';

/** URL the audio player streams spoken audio from. `lang` = reply language (needs Sarvam on the server). */
export function speechUrl(text: string, lang?: string): string {
  const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : '';
  return `${resolveApiBaseUrl()}/v1/speech?text=${encodeURIComponent(text.trim())}${langParam}`;
}

let current: AudioPlayer | null = null;

/**
 * Speaks `text` aloud through the Chatterbox TTS service. Resolves once playback
 * starts; rejects if the voice service is unreachable so the UI can show an error.
 * Replaces any audio already playing.
 */
export async function speak(text: string, lang?: string): Promise<void> {
  const body = text.trim();
  if (!body) return;

  // Confirm the service is reachable first, so an offline TTS surfaces as a clear
  // error instead of a silent no-op. ponytail: double-fetches short clips; fine here.
  const res = await fetch(speechUrl(body, lang));
  if (!res.ok) throw new Error(`voice unavailable (${res.status})`);

  await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  current?.remove();
  current = createAudioPlayer({ uri: speechUrl(body, lang) });
  current.play();
}

export function stopSpeaking(): void {
  current?.remove();
  current = null;
}
