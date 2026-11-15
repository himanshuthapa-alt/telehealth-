import type { SpeechLanguage } from '@telecare/shared';

/**
 * Text-to-speech port (project map §8.2). A result of `null` audio means
 * "no server audio — let the app speak the text with device TTS (expo-speech)".
 */
export interface TtsResult {
  audio: Buffer | null;
  mime: string | null;
  provider: string;
}

export interface TextToSpeech {
  readonly name: string;
  synthesize(text: string, language: SpeechLanguage): Promise<TtsResult>;
}

/**
 * No server audio. `name` tells the app what happened:
 * - 'device' = speak it yourself (expo-speech)
 * - 'fake'   = tests/demo, text only
 */
export function createNoAudioTts(name: 'device' | 'fake'): TextToSpeech {
  return {
    name,
    synthesize: async () => ({ audio: null, mime: null, provider: name }),
  };
}
