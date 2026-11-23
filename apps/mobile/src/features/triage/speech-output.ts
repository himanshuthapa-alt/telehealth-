import * as Speech from 'expo-speech';
import { api } from '@/lib/api';
import { speechLocale, type VoiceLanguage } from './voice-language';
import { playBase64Audio } from './play-base64-audio';

interface SynthesizedAudio {
  audioBase64: string;
  contentType: string;
  provider: string;
}

/** Prefer hosted Hindi/Hinglish voices, with the phone's speech engine as fallback. */
export async function speakWithFallback(text: string, language: VoiceLanguage): Promise<void> {
  Speech.stop();
  if (language === 'hindi' || language === 'hinglish') {
    try {
      const audio = await api.post<SynthesizedAudio>('/v1/voice/synthesize', { text, language });
      await playBase64Audio(audio.audioBase64, audio.contentType);
      return;
    } catch {
      // The system voice keeps replies available when the hosted provider is not configured.
    }
  }
  Speech.speak(text, { language: speechLocale(language), rate: 0.92 });
}
