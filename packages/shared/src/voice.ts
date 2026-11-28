/**
 * Voice intents — the fixed vocabulary the patient app understands when a user
 * speaks. `parseVoiceIntent` is a pure, synchronous, rule-based parser (keyword
 * lists in English + Hindi/Hinglish). No LLM, so it runs the same on the phone
 * (offline, instant) and on the server (`POST /voice/intent`), and in tests.
 *
 * The parser only *interprets*. It never books, orders, cancels or spends
 * money: those intents resolve to a screen where the app's own on-screen
 * confirmation runs. Emergency words always win.
 */
import type { Specialization } from './profile';

export const SPOKEN_LOCALES = ['hi-IN', 'en-IN'] as const;
export type SpokenLocale = (typeof SPOKEN_LOCALES)[number];

export const VOICE_INTENT_KINDS = [
  'emergency',
  'find_doctor',
  'list_appointments',
  'show_prescriptions',
  'go_home',
  'go_back',
  'help',
  'unknown',
] as const;
export type VoiceIntentKind = (typeof VOICE_INTENT_KINDS)[number];

export type VoiceIntent =
  | { kind: 'emergency' }
  | { kind: 'find_doctor'; specialization?: Specialization }
  | { kind: 'list_appointments' }
  | { kind: 'show_prescriptions' }
  | { kind: 'go_home' }
  | { kind: 'go_back' }
  | { kind: 'help' }
  | { kind: 'unknown' };

/** Red-flag words. Checked first so an emergency always wins over navigation. */
const EMERGENCY_WORDS = [
  'emergency',
  'chest pain',
  'not breathing',
  "can't breathe",
  'cant breathe',
  'unconscious',
  'heart attack',
  'stroke',
  'severe bleeding',
  'bleeding a lot',
  'suicide',
  'poison',
  'seizure',
  'choking',
  'save me', // how Sarvam translates "bachao"
  // Hindi / Hinglish
  'saans nahi',
  'saans nhi',
  'dam ghut',
  'behosh',
  'bachao',
  'seene me dard',
  'seene mein dard',
  'khoon bah',
  'zeher',
  'daura',
];

/** Specialty keywords → the app's Specialization value. Checked before generic nav. */
const SPECIALTIES: { words: string[]; specialization: Specialization }[] = [
  { words: ['skin', 'rash', 'itch', 'khujli', 'daane', 'pimple', 'acne'], specialization: 'Dermatology' },
  {
    words: [
      'child',
      'baby',
      'baccha',
      'bachha',
      'bacche',
      'bachche',
      'bachcha',
      'kid',
      'infant',
      'pediatric',
    ],
    specialization: 'Pediatrics',
  },
  { words: ['heart', 'chest', 'dil', 'dhadkan', 'cardio', 'bp'], specialization: 'Cardiology' },
  { words: ['bone', 'joint', 'knee', 'haddi', 'back pain', 'ortho'], specialization: 'Orthopedics' },
  { words: ['ear', 'nose', 'throat', 'kaan', 'gala', 'naak', 'ent'], specialization: 'ENT' },
  { words: ['women', 'woman', 'pregnan', 'gynae', 'gyno', 'mahila', 'period'], specialization: 'Gynecology' },
  {
    words: ['mind', 'mental', 'tension', 'depress', 'anxiety', 'stress', 'mann'],
    specialization: 'Psychiatry',
  },
  {
    words: ['fever', 'cough', 'cold', 'general', 'bukhar', 'physician'],
    specialization: 'General Physician',
  },
];

const has = (text: string, words: string[]): boolean => words.some((w) => text.includes(w));

export function parseVoiceIntent(transcript: string): VoiceIntent {
  const text = transcript.toLowerCase().trim();
  if (!text) return { kind: 'unknown' };

  // Emergency always wins.
  if (has(text, EMERGENCY_WORDS)) return { kind: 'emergency' };

  if (has(text, ['go back', 'back', 'wapas', 'peeche', 'previous', 'cancel'])) {
    return { kind: 'go_back' };
  }

  if (has(text, ['help', 'madad', 'what can i say', 'commands', 'kya bol', 'options'])) {
    return { kind: 'help' };
  }

  for (const s of SPECIALTIES) {
    if (has(text, s.words)) return { kind: 'find_doctor', specialization: s.specialization };
  }

  if (has(text, ['doctor', 'doctors', 'find a doctor', 'dhundo', 'consult'])) {
    return { kind: 'find_doctor' };
  }

  if (has(text, ['booking', 'appointment', 'appointments', 'my visits', 'meeting'])) {
    return { kind: 'list_appointments' };
  }

  if (has(text, ['medicine', 'medicines', 'dawai', 'dawa', 'pharmacy', 'order', 'prescription'])) {
    return { kind: 'show_prescriptions' };
  }

  if (has(text, ['home', 'ghar', 'start', 'main screen', 'mukhya'])) {
    return { kind: 'go_home' };
  }

  return { kind: 'unknown' };
}

/** True if the parsed intent is a valid member of the fixed vocabulary. */
export function isVoiceIntent(value: unknown): value is VoiceIntent {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === 'string' && (VOICE_INTENT_KINDS as readonly string[]).includes(kind);
}
