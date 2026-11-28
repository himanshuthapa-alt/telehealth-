/**
 * Sarvam AI (Indian-language speech). Three calls, all with the
 * `api-subscription-key` header:
 * - speech-to-text, mode=translate: any of 23 Indian languages → English text,
 *   so the existing English keyword parser understands every language.
 * - translate: our English reply → the speaker's language.
 * - text-to-speech (Bulbul): that reply → WAV in the speaker's language.
 */
const BASE = 'https://api.sarvam.ai';

/** Languages Bulbul can speak. Anything else is answered in Indian English. */
export const TTS_LANGUAGES = [
  'hi-IN',
  'bn-IN',
  'ta-IN',
  'te-IN',
  'kn-IN',
  'ml-IN',
  'mr-IN',
  'gu-IN',
  'pa-IN',
  'od-IN',
  'en-IN',
] as const;
export type TtsLanguage = (typeof TTS_LANGUAGES)[number];
export const isTtsLanguage = (v: unknown): v is TtsLanguage =>
  typeof v === 'string' && (TTS_LANGUAGES as readonly string[]).includes(v);

export class SarvamError extends Error {
  constructor(readonly status: number) {
    super(`Sarvam returned ${status}`);
  }
}

export interface Sarvam {
  /** Audio (≤30 s) in any Indian language → English text + the detected language. */
  understand(audio: Buffer, mimeType: string): Promise<{ english: string; languageCode: string | null }>;
  /** English text → speech (WAV) in `lang`, translated first when lang isn't English. */
  speak(text: string, lang: TtsLanguage): Promise<Buffer>;
}

export function createSarvam({ apiKey, fetch: f = fetch }: { apiKey: string; fetch?: typeof fetch }): Sarvam {
  const call = async (path: string, init: RequestInit) => {
    const res = await f(`${BASE}${path}`, {
      ...init,
      headers: { 'api-subscription-key': apiKey, ...init.headers },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new SarvamError(res.status);
    return res.json() as Promise<Record<string, unknown>>;
  };

  const translate = async (text: string, lang: TtsLanguage) => {
    if (lang === 'en-IN') return text;
    try {
      const out = await call('/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: text, source_language_code: 'en-IN', target_language_code: lang }),
      });
      return typeof out.translated_text === 'string' ? out.translated_text : text;
    } catch {
      return text; // ponytail: an English reply in an Indian voice beats silence
    }
  };

  return {
    async understand(audio, mimeType) {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), 'speech');
      form.append('mode', 'translate');
      form.append('language_code', 'unknown');
      const out = await call('/speech-to-text', { method: 'POST', body: form });
      return {
        english: typeof out.transcript === 'string' ? out.transcript : '',
        languageCode: typeof out.language_code === 'string' ? out.language_code : null,
      };
    },
    async speak(text, lang) {
      const out = await call('/text-to-speech', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: await translate(text, lang), language_code: lang, model: 'bulbul:v3' }),
      });
      // One input text → one WAV (our replies are well under the 2,500-char limit).
      const wav = Array.isArray(out.audios) ? out.audios[0] : undefined;
      if (typeof wav !== 'string') throw new SarvamError(502);
      return Buffer.from(wav, 'base64');
    },
  };
}
