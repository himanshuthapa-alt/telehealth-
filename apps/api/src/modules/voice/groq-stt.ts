import type { SpeechToText, SttResult } from './stt';

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export interface GroqSttConfig {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

/**
 * Groq Whisper transcription (free tier). Uses verbose_json so the response
 * carries a detected `language` field (project map §7.3). Node 24's global
 * FormData/Blob build the multipart body — no extra dependency.
 */
export function createGroqStt(config: GroqSttConfig): SpeechToText {
  const timeout = config.timeoutMs ?? 15000;
  return {
    name: 'groq',
    transcribe: async (audio, opts): Promise<SttResult> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const form = new FormData();
        const ext = opts.contentType.includes('wav')
          ? 'wav'
          : opts.contentType.includes('mp3')
            ? 'mp3'
            : 'm4a';
        form.append('file', new Blob([new Uint8Array(audio)], { type: opts.contentType }), `turn.${ext}`);
        form.append('model', config.model);
        form.append('response_format', 'verbose_json');
        form.append('temperature', '0');
        const res = await fetch(GROQ_STT_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}` },
          body: form,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Groq STT ${res.status}`);
        const data = (await res.json()) as { text?: string; language?: string };
        return { text: (data.text ?? '').trim(), language: data.language };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
