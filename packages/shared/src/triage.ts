import type { Specialization } from './profile';

export type TriageUrgency = 'EMERGENCY' | 'URGENT' | 'ROUTINE';

export interface EmergencyAction {
  dial: string;
  label: string;
  description: string;
}

export const EMERGENCY_NUMBERS: EmergencyAction[] = [
  { dial: '112', label: 'Call 112', description: 'National Emergency Helpline (Police / Fire / Medical)' },
  { dial: '108', label: 'Call 108', description: 'Emergency Medical & Ambulance Service' },
];

/**
 * Emergency red-flag keywords across English, Hindi, Hinglish, and Garhwali.
 * If any of these are present, the app triggers an immediate emergency warning
 * without running AI symptom classification or booking an appointment.
 */
export const EMERGENCY_KEYWORDS = [
  // English
  'chest pain',
  'heart attack',
  'cannot breathe',
  "can't breathe",
  'difficulty breathing',
  'shortness of breath',
  'unconscious',
  'unresponsive',
  'heavy bleeding',
  'severe bleeding',
  'coughing blood',
  'stroke',
  'face drooping',
  'poison',
  'poisoning',
  'seizure',
  'fit',
  'collapsed',

  // Hindi / Hinglish
  'chaati me dard',
  'chhati me dard',
  'seene me dard',
  'dil ka daura',
  'saans nahi',
  'saans lene me takleef',
  'behosh',
  'khoon beh raha',
  'khoon ki ulti',
  'zahar',
  'jhatke',
  'dora',

  // Garhwali
  'chhati peeda',
  'saans ni aarun',
  'hosh ni',
  'lahu behndo',
] as const;

/**
 * Checks if the text contains any red-flag emergency symptoms.
 */
export function checkEmergencyKeywords(text: string): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase().trim();
  return EMERGENCY_KEYWORDS.some((kw) => normalized.includes(kw));
}

export interface TriageRequest {
  /** The patient's reported symptoms (text or transcribed voice). */
  symptoms: string;
  /** Language tag or hint if known (e.g. 'hi', 'en', 'hi-en', 'gbm'). */
  language?: string;
}

export interface TriageResult {
  /** Emergency: call 112/108; Urgent: on-call doctor; Routine: book slot. */
  urgency: TriageUrgency;
  /** Recommended doctor specialty for routine/urgent care. */
  recommendedSpecialization: Specialization;
  /** Plain-language summary of what the patient reported. */
  summary: string;
  /** Legal & medical safety disclaimer: strictly not a diagnosis. */
  disclaimer: string;
  /** Emergency helpline details if urgency is EMERGENCY. */
  emergencyActions?: EmergencyAction[];
  /** Detected or processed language. */
  detectedLanguage?: string;
  /** Model-reported language certainty, used only with independent speech checks. */
  languageConfidence?: number;
}

export const TRIAGE_DISCLAIMER =
  'AI summary \u2014 not a diagnosis. A registered doctor makes every medical decision.';

export const SPOKEN_DISCLAIMER_HI =
  '\u092e\u0948\u0902 \u090f\u0915 \u090f\u0906\u0908 \u0938\u0939\u093e\u092f\u0915 \u0939\u0942\u0901, \u0921\u0949\u0915\u094d\u091f\u0930 \u0928\u0939\u0940\u0902\u0964 \u0938\u092d\u0940 \u091a\u093f\u0915\u093f\u0924\u094d\u0938\u0940\u092f \u0928\u093f\u0930\u094d\u0923\u092f \u0939\u092e\u093e\u0930\u0947 \u092a\u0902\u091c\u0940\u0915\u0943\u0924 \u0921\u0949\u0915\u094d\u091f\u0930 \u0932\u0947\u0924\u0947 \u0939\u0948\u0902\u0964';

export const SPOKEN_DISCLAIMER_EN =
  'I am an AI assistant, not a doctor. A registered doctor makes every medical decision.';
