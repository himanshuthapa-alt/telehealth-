import type { TriageResult } from '@telecare/shared';

export const VOICE_LANGUAGES = [
  { id: 'hindi', label: 'Hindi', speechLocale: 'hi-IN' },
  { id: 'hinglish', label: 'Hinglish', speechLocale: 'hi-IN' },
  { id: 'english', label: 'English', speechLocale: 'en-IN' },
  // There is not yet a verified Garhwali speech model or voice. Hindi is the safe spoken fallback.
  { id: 'garhwali', label: 'Garhwali', speechLocale: 'hi-IN' },
] as const;

export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]['id'];

const CONFIDENCE_THRESHOLD = 0.8;

function normalizeLanguage(value: string | null | undefined): VoiceLanguage | null {
  const language = value?.toLowerCase().trim();
  if (!language) return null;
  if (language === 'hi' || language.includes('hindi')) return 'hindi';
  if (language === 'en' || language.includes('english')) return 'english';
  if (language.includes('hinglish') || language === 'hi-en') return 'hinglish';
  if (language.includes('garhwali') || language === 'gbm') return 'garhwali';
  return null;
}

/** A conservative word/script check, independent of the model's language label. */
export function checkTranscriptLanguage(text: string): {
  language: VoiceLanguage | null;
  confidence: number;
} {
  const devanagari = (text.match(/[\u0900-\u097f]/g) ?? []).length;
  const letters = (text.match(/[\p{L}]/gu) ?? []).length;
  if (letters > 0 && devanagari / letters >= 0.55) return { language: 'hindi', confidence: 0.98 };

  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const garhwaliWords = new Set([
    'myara',
    'tyara',
    'kakh',
    'kakhya',
    'chhaun',
    'chhu',
    'tumen',
    'holu',
    'bwari',
  ]);
  const hinglishWords = new Set([
    'hai',
    'hain',
    'hoon',
    'mujhe',
    'mera',
    'meri',
    'dard',
    'bukhar',
    'khansi',
    'chahiye',
    'nahi',
    'kaisa',
    'aaj',
  ]);
  const englishWords = new Set([
    'i',
    'have',
    'my',
    'the',
    'a',
    'is',
    'are',
    'pain',
    'fever',
    'cough',
    'headache',
    'for',
    'days',
    'since',
    'and',
    'severe',
    'chest',
    'sweating',
    'itchy',
    'rash',
    'please',
    'doctor',
  ]);
  const count = (vocabulary: Set<string>) => words.filter((word) => vocabulary.has(word)).length;
  const garhwaliCount = count(garhwaliWords);
  if (garhwaliCount >= 2)
    return { language: 'garhwali', confidence: Math.min(0.96, 0.72 + garhwaliCount * 0.08) };
  const hinglishCount = count(hinglishWords);
  if (hinglishCount >= 2)
    return { language: 'hinglish', confidence: Math.min(0.96, 0.72 + hinglishCount * 0.08) };
  const englishCount = count(englishWords);
  if (englishCount >= 2)
    return { language: 'english', confidence: Math.min(0.96, 0.72 + englishCount * 0.08) };
  return { language: null, confidence: 0 };
}

export function resolveVoiceLanguage(input: {
  whisperLanguage: string | null;
  whisperConfidence: number;
  transcript: string;
  triage: TriageResult;
  savedLanguage: VoiceLanguage | null;
}): { language: VoiceLanguage | null; needsSelection: boolean } {
  const whisper = normalizeLanguage(input.whisperLanguage);
  const words = checkTranscriptLanguage(input.transcript);
  const ai = normalizeLanguage(input.triage.detectedLanguage);
  const signalsAgree =
    whisper !== null &&
    whisper === words.language &&
    whisper === ai &&
    input.whisperConfidence >= CONFIDENCE_THRESHOLD &&
    words.confidence >= CONFIDENCE_THRESHOLD &&
    (input.triage.languageConfidence ?? 0) >= CONFIDENCE_THRESHOLD;

  if (signalsAgree) return { language: whisper, needsSelection: false };
  return { language: input.savedLanguage, needsSelection: input.savedLanguage === null };
}

export function speechLocale(language: VoiceLanguage): string {
  return VOICE_LANGUAGES.find((item) => item.id === language)?.speechLocale ?? 'hi-IN';
}

export function savedVoiceLanguage(value: string | null): VoiceLanguage | null {
  return normalizeLanguage(value);
}
