/**
 * Speech-to-text port (project map §8.2). Groq Whisper is one implementation;
 * the fake returns a canned transcript so tests and the demo need no key.
 */
export interface SttResult {
  text: string;
  /** STT-reported language id, e.g. 'hi', 'en' (used by the language service). */
  language?: string;
}

export interface SpeechToText {
  readonly name: string;
  transcribe(audio: Buffer, opts: { contentType: string; demoTranscript?: string }): Promise<SttResult>;
}

/**
 * No real STT: returns the `demoTranscript` the client sent (header
 * x-demo-transcript), else a default Hindi line. Lets the whole voice flow run
 * with typed/example input and no audio account.
 */
export function createFakeStt(): SpeechToText {
  return {
    name: 'fake',
    transcribe: async (_audio, opts) => ({
      text: opts.demoTranscript?.trim() || 'तीन दिन से बुखार और खांसी है',
      language: 'hi',
    }),
  };
}
