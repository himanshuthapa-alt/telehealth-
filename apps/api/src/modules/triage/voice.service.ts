import { AppError } from '../../platform/http/errors';

export type SpokenLanguage = 'hindi' | 'hinglish' | 'english' | 'garhwali';

export interface SpeechServiceDeps {
  googleApiKey?: string;
  sarvamApiKey?: string;
  externalServicesMode: 'test' | 'live';
}

export function createVoiceService(deps: SpeechServiceDeps) {
  return {
    async synthesize(text: string, language: SpokenLanguage) {
      if (deps.externalServicesMode !== 'live') {
        throw new AppError(
          503,
          'SERVICE_UNAVAILABLE',
          'Hosted speech is disabled in external-services test mode.',
        );
      }

      if (language === 'hindi' && deps.googleApiKey) return synthesizeWithGoogle(text, deps.googleApiKey);
      if (language === 'hinglish' && deps.sarvamApiKey) return synthesizeWithSarvam(text, deps.sarvamApiKey);
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'No hosted speech provider is configured for this language.',
      );
    },
  };
}

async function synthesizeWithGoogle(text: string, apiKey: string) {
  let response: Response;
  try {
    const endpoint = new URL('https://texttospeech.googleapis.com/v1/text:synthesize');
    endpoint.searchParams.set('key', apiKey);
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.92 },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Hindi speech synthesis is temporarily unavailable.');
  }

  if (!response.ok)
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Hindi speech synthesis is temporarily unavailable.');
  const result = (await response.json().catch(() => null)) as { audioContent?: unknown } | null;
  if (typeof result?.audioContent !== 'string' || !result.audioContent) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Hindi speech synthesis returned no audio.');
  }
  return { audioBase64: result.audioContent, contentType: 'audio/mpeg', provider: 'google-wavenet' as const };
}

async function synthesizeWithSarvam(text: string, apiKey: string) {
  let response: Response;
  try {
    response = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model: 'bulbul:v4-flash',
        language_code: 'en-IN',
        speaker: 'shubh_enhi_ads',
        output_audio_codec: 'mp3',
        speech_sample_rate: 22050,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Hinglish speech synthesis is temporarily unavailable.');
  }

  if (!response.ok)
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Hinglish speech synthesis is temporarily unavailable.');
  const result = (await response.json().catch(() => null)) as { audios?: unknown } | null;
  const audioBase64 =
    Array.isArray(result?.audios) && typeof result.audios[0] === 'string' ? result.audios[0] : '';
  if (!audioBase64)
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Hinglish speech synthesis returned no audio.');
  return { audioBase64, contentType: 'audio/mpeg', provider: 'sarvam-bulbul' as const };
}

export type VoiceService = ReturnType<typeof createVoiceService>;
