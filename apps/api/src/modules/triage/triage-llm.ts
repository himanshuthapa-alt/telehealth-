import {
  SYMPTOM_TAGS,
  SYMPTOM_TAG_CODES,
  type SpeechLanguage,
  type Specialization,
  type Urgency,
} from '@telecare/shared';

/** What every triage engine (LLM or fake) must return. Validated before use. */
export interface TriageLlmOutput {
  tags: string[];
  urgency: Urgency;
  specialization: Specialization;
  summaryForDoctor: string;
  /** Optional model-written reply; the service prefers a template to stay safe. */
  replyText?: string;
  language?: SpeechLanguage;
  needsClarification: boolean;
}

export interface TriageLlmInput {
  transcript: string;
  language: SpeechLanguage;
}

/**
 * Turns a transcript into a symptom tag set, an urgency lane and a specialty.
 * NEVER a diagnosis or a medicine. A real adapter (Groq) or the deterministic
 * fake both satisfy this port.
 */
export interface TriageLlm {
  readonly name: string;
  triage(input: TriageLlmInput): Promise<TriageLlmOutput>;
}

// Keyword lexicon for the deterministic matcher (also the LLM-failure fallback, §11).
const KEYWORDS: Record<string, { hi: string[]; rx: string[] }> = {
  fever: {
    hi: ['बुखार', 'बुख़ार', 'ज्वर', 'तेज बुखार', 'ताप'],
    rx: ['bukhar', 'fever', 'tej bukhar', 'temperature'],
  },
  cough_cold: {
    hi: ['खांसी', 'खाँसी', 'कफ', 'जुकाम', 'ज़ुकाम', 'नाक बह'],
    rx: ['khansi', 'cough', 'cold', 'jukam', 'zukam', 'sardi'],
  },
  stomach: {
    hi: ['पेट दर्द', 'पेट में दर्द', 'पेट खराब', 'दस्त', 'उल्टी', 'लूज मोशन'],
    rx: [
      'pet dard',
      'pet me dard',
      'stomach',
      'loose motion',
      'vomit',
      'ulti',
      'dast',
      'diarrhea',
      'diarrhoea',
    ],
  },
  headache: {
    hi: ['सिर दर्द', 'सर दर्द', 'सिरदर्द', 'माइग्रेन'],
    rx: ['sir dard', 'sar dard', 'headache', 'migraine'],
  },
  weakness: {
    hi: ['कमज़ोरी', 'कमजोरी', 'थकान', 'चक्कर'],
    rx: ['kamzori', 'weakness', 'thakan', 'tiredness', 'chakkar', 'dizzy'],
  },
  rash: { hi: ['खुजली', 'दाने', 'चकत्ते', 'दाद'], rx: ['khujli', 'rash', 'daane', 'itching', 'daad'] },
  skin_infection: {
    hi: ['त्वचा', 'फोड़े', 'फुंसी', 'घाव', 'पस'],
    rx: ['skin', 'twacha', 'boil', 'pus', 'phode'],
  },
  ear_pain: { hi: ['कान', 'कान में दर्द', 'कान बह'], rx: ['kaan', 'kan me dard', 'ear pain', 'ear'] },
  throat: {
    hi: ['गला', 'गले में', 'गले में दर्द', 'टॉन्सिल'],
    rx: ['gala', 'throat', 'gale me dard', 'tonsil'],
  },
  joint_pain: {
    hi: ['जोड़', 'घुटना', 'घुटने', 'कमर दर्द', 'कमर में', 'हड्डी', 'कंधा'],
    rx: ['ghutn', 'joint', 'knee', 'back pain', 'kamar', 'haddi', 'kandha'],
  },
  injury: {
    hi: ['मोच', 'चोट', 'गिर गया', 'फ्रैक्चर'],
    rx: ['moch', 'chot', 'injury', 'sprain', 'fracture', 'gir gaya'],
  },
  period_problem: {
    hi: ['माहवारी', 'पीरियड', 'मासिक', 'महीना'],
    rx: ['period', 'masik', 'mahvari', 'menstru'],
  },
  pregnancy: { hi: ['गर्भ', 'प्रेगनेंट', 'गर्भवती', 'पेट में बच्चा'], rx: ['pregnan', 'garbh', 'garbhvati'] },
  palpitations: {
    hi: ['धड़कन', 'दिल तेज़', 'दिल जोर से'],
    rx: ['palpitation', 'dhadkan', 'heart racing', 'dil tez'],
  },
  child_illness: {
    hi: ['बच्चा', 'बच्चे', 'शिशु', 'मेरे बेटे', 'मेरी बेटी', 'नवजात'],
    rx: ['baccha', 'bacche', 'bachche', 'child', 'baby', 'beta ko', 'beti ko', 'infant', 'newborn'],
  },
  low_mood: {
    hi: ['नींद नहीं', 'तनाव', 'उदास', 'घबराहट', 'चिंता', 'डिप्रेशन', 'मन नहीं लग'],
    rx: ['neend nahi', 'tension', 'udaas', 'anxiety', 'depress', 'stress', 'chinta', 'ghabrahat'],
  },
};

const TAG_BY_CODE = new Map(SYMPTOM_TAGS.map((t) => [t.code, t]));

/** Deterministic matcher: scan the transcript for known symptom keywords. */
export function matchSymptoms(transcript: string): string[] {
  const text = transcript ?? '';
  const low = text.toLowerCase();
  const found: string[] = [];
  for (const code of SYMPTOM_TAG_CODES) {
    const kw = KEYWORDS[code];
    if (!kw) continue;
    if (kw.hi.some((p) => text.includes(p)) || kw.rx.some((p) => low.includes(p))) found.push(code);
  }
  return found;
}

/** Resolve tags to a single specialty + urgency (child routes to Pediatrics). */
export function resolveRouting(tags: string[]): { specialization: Specialization; urgency: Urgency } {
  const resolved = tags.map((c) => TAG_BY_CODE.get(c)).filter((t): t is NonNullable<typeof t> => !!t);
  if (resolved.length === 0) return { specialization: 'General Physician', urgency: 'ROUTINE' };
  const isChild = resolved.some((t) => t.code === 'child_illness');
  const primary = resolved.find((t) => t.code !== 'child_illness') ?? resolved[0];
  if (!primary) return { specialization: 'General Physician', urgency: 'ROUTINE' };
  const specialization: Specialization =
    isChild && primary.childTo ? primary.childTo : isChild ? 'Pediatrics' : primary.specialization;
  const urgency: Urgency = resolved.some((t) => t.urgency === 'URGENT') ? 'URGENT' : 'ROUTINE';
  return { specialization, urgency };
}

/**
 * The deterministic triage engine. Used as LLM_PROVIDER=fake (demos, tests, no
 * keys) and as the fallback when the real LLM fails (project map §11).
 */
export function createFakeTriageLlm(): TriageLlm {
  return {
    name: 'fake',
    triage: async ({ transcript }) => {
      const tags = matchSymptoms(transcript);
      const { specialization, urgency } = resolveRouting(tags);
      const labels = tags
        .map((c) => TAG_BY_CODE.get(c)?.labelEn)
        .filter(Boolean)
        .join(', ');
      return {
        tags,
        urgency,
        specialization,
        summaryForDoctor: labels
          ? `Patient reports: ${labels}. (AI summary — not a diagnosis.)`
          : 'Patient described symptoms that did not match the known vocabulary. Routed to a General Physician.',
        needsClarification: tags.length === 0 && transcript.trim().length < 6,
      };
    },
  };
}
