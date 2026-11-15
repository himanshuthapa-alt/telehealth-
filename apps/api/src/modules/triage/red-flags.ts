/**
 * Deterministic emergency red-flag rules (project map §6.4, §12).
 *
 * These run BEFORE the LLM. If any phrase matches, the turn is EMERGENCY and the
 * patient is told to call 112/108 — nothing is booked. The LLM can ALSO flag an
 * emergency; either one is enough. We over-trigger on purpose: a missed emergency
 * is far worse than a false alarm.
 *
 * ⚠️ A clinician must review this list before real use.
 */
export interface RedFlag {
  code: string;
  reason: string;
  /** Devanagari phrases. */
  hi: string[];
  /** Romanised / English phrases (matched case-insensitively). */
  rx: string[];
}

export const RED_FLAGS: readonly RedFlag[] = [
  {
    code: 'chest_pain',
    reason: 'सीने में दर्द / chest pain',
    hi: ['सीने में दर्द', 'सीने मे दर्द', 'छाती में दर्द', 'दिल का दौरा'],
    rx: ['seene me dard', 'seene mein dard', 'chest pain', 'chhati me dard', 'heart attack', 'dil ka daura'],
  },
  {
    code: 'breathing',
    reason: 'साँस नहीं आ रही / breathing difficulty',
    hi: ['साँस नहीं', 'सांस नहीं', 'दम घुट', 'साँस फूल', 'सांस फूल'],
    rx: [
      'saans nahi',
      'saas nahi',
      'saans nhi',
      'not breathing',
      'cant breathe',
      "can't breathe",
      'cannot breathe',
      'dam ghut',
      'breathless',
    ],
  },
  {
    code: 'unconscious',
    reason: 'बेहोशी / unconscious',
    hi: ['बेहोश', 'होश नहीं', 'अचेत'],
    rx: ['behosh', 'behosh ho', 'unconscious', 'fainted', 'no response', 'pass out'],
  },
  {
    code: 'stroke',
    reason: 'लकवा / stroke signs',
    hi: ['लकवा', 'मुँह टेढ़ा', 'मुंह टेढ़ा', 'बोल नहीं पा', 'एक तरफ कमज़ोर'],
    rx: ['lakwa', 'stroke', 'face droop', 'slurred', 'muh tedha'],
  },
  {
    code: 'bleeding',
    reason: 'तेज़ खून बहना / heavy bleeding',
    hi: ['खून बह', 'बहुत खून', 'खून नहीं रुक', 'खून बंद नहीं'],
    rx: ['khoon beh', 'khoon nahi ruk', 'heavy bleeding', 'bleeding a lot', 'blood not stopping'],
  },
  {
    code: 'seizure',
    reason: 'दौरा / seizure',
    hi: ['दौरा', 'मिर्गी', 'झटके आ'],
    rx: ['daura', 'seizure', 'fits aa', 'convulsion', 'jhatke'],
  },
  {
    code: 'self_harm',
    reason: 'आत्मघाती विचार / self-harm',
    hi: ['आत्महत्या', 'खुद को खत्म', 'जीना नहीं चाहता', 'मरना चाहता', 'खुदकुशी'],
    rx: [
      'aatmhatya',
      'khudkushi',
      'suicide',
      'end my life',
      'kill myself',
      'marna chahta',
      'jeena nahi chahta',
    ],
  },
  {
    code: 'snake_bite',
    reason: 'साँप का काटना / snake bite',
    hi: ['साँप ने काट', 'सांप ने काट', 'साँप काट', 'सांप काट'],
    rx: ['saap ne kaat', 'saanp ne kaat', 'snake bite', 'snakebite'],
  },
  {
    code: 'severe_allergy',
    reason: 'गंभीर एलर्जी / severe allergy',
    hi: ['गला बंद', 'पूरे शरीर पर सूजन', 'सूजन और साँस'],
    rx: ['throat closing', 'anaphylaxis', 'swelling and breathing', 'whole body swelling'],
  },
  {
    code: 'infant_emergency',
    reason: 'नवजात आपात / infant emergency',
    hi: ['नवजात बेहोश', 'बच्चा बेहोश', 'शिशु साँस नहीं'],
    rx: ['newborn unconscious', 'infant not breathing', 'baby unconscious'],
  },
  {
    code: 'poisoning',
    reason: 'ज़हर / poisoning',
    hi: ['ज़हर खा', 'जहर खा', 'दवा ज़्यादा खा'],
    rx: ['poison', 'zahar kha', 'overdose', 'too many pills'],
  },
];

export interface RedFlagResult {
  hit: boolean;
  /** The first matched reason (shown/spoken to the patient). */
  reason: string | null;
  /** Every rule code that matched (stored on triage_results.ruleHits). */
  ruleHits: string[];
}

/**
 * A Devanagari phrase matches if ALL its words appear (not necessarily adjacent),
 * so "सीने में दर्द" still fires on "सीने में बहुत दर्द है". Romanised phrases use a
 * whole-string match, since their short tokens (me, aa) would over-match as substrings.
 */
function hiMatch(text: string, phrase: string): boolean {
  const words = phrase.split(/\s+/).filter(Boolean);
  return words.every((w) => text.includes(w));
}

/** Scan a transcript for emergency phrases. Pure and synchronous (project map §11 latency budget). */
export function checkRedFlags(transcript: string): RedFlagResult {
  const text = transcript ?? '';
  const low = text.toLowerCase();
  const hits: string[] = [];
  let firstReason: string | null = null;
  for (const flag of RED_FLAGS) {
    const matched = flag.hi.some((p) => hiMatch(text, p)) || flag.rx.some((p) => low.includes(p));
    if (matched) {
      hits.push(flag.code);
      if (!firstReason) firstReason = flag.reason;
    }
  }
  return { hit: hits.length > 0, reason: firstReason, ruleHits: hits };
}
