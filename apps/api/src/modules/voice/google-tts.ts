import type { SpeechLanguage } from '@telecare/shared';
import type { TextToSpeech, TtsResult } from './tts';

const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

export interface GoogleTtsConfig {
  apiKey: string;
  timeoutMs?: number;
}

/** WaveNet voice per reply language (project map §7). Garhwali speaks via the Hindi voice. */
const VOICE: Record<SpeechLanguage, { languageCode: string; name: string }> = {
  hi: { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A' },
  'hi-en': { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A' },
  en: { languageCode: 'en-IN', name: 'en-IN-Wavenet-A' },
  gbm: { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A' },
};

/**
 * Google Cloud TTS WaveNet (4M free chars/month). Returns MP3 bytes. On any
 * failure the voice service falls back to device TTS, so this throws loudly.
 */
export function createGoogleTts(config: GoogleTtsConfig): TextToSpeech {
  const timeout = config.timeoutMs ?? 8000;
  return {
    name: 'google',
    synthesize: async (text, language): Promise<TtsResult> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const voice = VOICE[language];
        const res = await fetch(`${GOOGLE_TTS_URL}?key=${encodeURIComponent(config.apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: text.slice(0, 1800) },
            voice: { languageCode: voice.languageCode, name: voice.name },
            audioConfig: { audioEncoding: 'MP3' },
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Google TTS ${res.status}`);
        const data = (await res.json()) as { audioContent?: string };
        if (!data.audioContent) throw new Error('Google TTS empty response');
        return { audio: Buffer.from(data.audioContent, 'base64'), mime: 'audio/mpeg', provider: 'google' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
