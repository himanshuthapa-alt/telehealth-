import * as Speech from 'expo-speech';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import type { SpeechLanguage } from '@telecare/shared';

/** Reply language -> a BCP-47 tag the device TTS understands. Garhwali speaks as Hindi. */
const TTS_LANGUAGE: Record<SpeechLanguage, string> = {
  hi: 'hi-IN',
  'hi-en': 'hi-IN',
  en: 'en-IN',
  gbm: 'hi-IN',
};

let player: AudioPlayer | null = null;

/** Stop any reply currently playing (device speech or server audio). */
export function stopSpeaking(): void {
  try {
    Speech.stop();
  } catch {
    // Speech may not be speaking; ignore.
  }
  if (player) {
    try {
      player.remove();
    } catch {
      // already released
    }
    player = null;
  }
}

/**
 * Speak the triage reply. Prefers server audio (Google WaveNet) when present,
 * otherwise falls back to the device's own voice (expo-speech) — which needs no
 * key and works in Expo Go. Always keep the text on screen too.
 */
export function speakReply(reply: {
  replyText: string;
  language: SpeechLanguage;
  audioBase64: string | null;
  audioMime: string | null;
}): void {
  stopSpeaking();
  if (reply.audioBase64) {
    try {
      const uri = `data:${reply.audioMime ?? 'audio/mpeg'};base64,${reply.audioBase64}`;
      player = createAudioPlayer({ uri });
      player.play();
      return;
    } catch {
      // Fall through to device TTS.
    }
  }
  try {
    Speech.speak(reply.replyText, { language: TTS_LANGUAGE[reply.language], rate: 0.95 });
  } catch {
    // No TTS available; the text is already on screen.
  }
}
