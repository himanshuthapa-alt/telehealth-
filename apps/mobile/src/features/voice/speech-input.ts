/**
 * SpeechInput port — the one place the app talks to a speech-to-text engine.
 *
 * Default adapter: on-device recognition via `expo-speech-recognition` (needs a
 * dev build — see docs/SETUP.md). It is free, works offline, and keeps health
 * data on the phone.
 *
 * Server-side slot: a cloud adapter (Sarvam AI or Bhashini) would give better
 * Hinglish / regional accuracy. To add one, implement `SpeechInput` against its
 * streaming API and swap `speechInput` below — nothing else changes. Do not add
 * it until a key exists; keep the on-device adapter as the offline fallback.
 */
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

/** The two locales we support. Hindi first — most of our users speak it. */
export type SpeechLang = 'hi-IN' | 'en-IN';

/** Normalised reasons listening can fail, mapped to spoken/visible copy by the UI. */
export type SpeechErrorKind = 'no-permission' | 'no-network' | 'no-speech' | 'unavailable';

export interface SpeechInput {
  /** Ask once; resolves true if the mic may be used. */
  requestPermission(): Promise<boolean>;
  /** Begin listening. Emits partial + final transcripts via `useSpeechEvent`. */
  start(opts: { lang: SpeechLang }): void;
  /** Stop listening (finalises the current transcript). */
  stop(): void;
}

/** Default on-device adapter. */
export const speechInput: SpeechInput = {
  async requestPermission() {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return perm.granted;
  },
  start({ lang }) {
    ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: false });
  },
  stop() {
    ExpoSpeechRecognitionModule.stop();
  },
};

/** Subscribe to recognition events ('result' | 'end' | 'nomatch' | 'error'). */
export const useSpeechEvent = useSpeechRecognitionEvent;

/** Map the engine's raw error string to a reason the UI knows how to voice. */
export function normalizeSpeechError(raw: string | undefined): SpeechErrorKind {
  switch (raw) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'no-permission';
    case 'network':
      return 'no-network';
    case 'no-speech':
      return 'no-speech';
    default:
      return 'unavailable';
  }
}
