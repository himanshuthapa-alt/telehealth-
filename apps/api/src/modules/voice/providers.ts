import type { Config } from '../../config/env';
import type { Logger } from '../../platform/logger';
import { createFakeTelephony, type Telephony } from '../dispatch/telephony';
import { createGroqTriageLlm } from '../triage/groq-llm';
import { createFakeTriageLlm, type TriageLlm } from '../triage/triage-llm';
import { createGoogleTts } from './google-tts';
import { createGroqStt } from './groq-stt';
import { createFakeStt, type SpeechToText } from './stt';
import { createNoAudioTts, type TextToSpeech } from './tts';

export interface VoiceProviders {
  stt: SpeechToText;
  tts: TextToSpeech;
  /** The triage engine and its deterministic fallback. */
  llm: TriageLlm;
  fallback: TriageLlm;
  telephony: Telephony | null;
}

/**
 * Picks real or fake adapters from config (project map §8.4). Every provider has
 * a fake mode, so the whole voice stack boots with no keys and no cost. Providers
 * not yet implemented (sarvam, exotel) fall back to fake and warn.
 */
export function buildVoiceProviders(config: Config, logger: Logger): VoiceProviders {
  const fallback = createFakeTriageLlm();

  let stt: SpeechToText;
  if (config.STT_PROVIDER === 'groq' && config.GROQ_API_KEY) {
    stt = createGroqStt({ apiKey: config.GROQ_API_KEY, model: config.GROQ_STT_MODEL });
  } else {
    if (config.STT_PROVIDER === 'sarvam') logger.warn('STT_PROVIDER=sarvam not implemented yet, using fake');
    stt = createFakeStt();
  }

  let tts: TextToSpeech;
  if (config.TTS_PROVIDER === 'google' && config.GCP_TTS_KEY) {
    tts = createGoogleTts({ apiKey: config.GCP_TTS_KEY });
  } else if (config.TTS_PROVIDER === 'device') {
    tts = createNoAudioTts('device');
  } else {
    if (config.TTS_PROVIDER === 'sarvam')
      logger.warn('TTS_PROVIDER=sarvam not implemented yet, using device TTS');
    tts = config.TTS_PROVIDER === 'sarvam' ? createNoAudioTts('device') : createNoAudioTts('fake');
  }

  let llm: TriageLlm;
  if (config.LLM_PROVIDER === 'groq' && config.GROQ_API_KEY) {
    llm = createGroqTriageLlm({
      apiKey: config.GROQ_API_KEY,
      model: config.GROQ_LLM_MODEL,
      fallbackModel: 'openai/gpt-oss-20b',
    });
  } else {
    llm = fallback;
  }

  let telephony: Telephony | null;
  if (config.TELEPHONY_PROVIDER === 'none') telephony = null;
  else {
    if (config.TELEPHONY_PROVIDER === 'exotel')
      logger.warn('TELEPHONY_PROVIDER=exotel not implemented yet (needs KYC/DLT), using fake');
    telephony = createFakeTelephony(logger);
  }

  return { stt, tts, llm, fallback, telephony };
}
