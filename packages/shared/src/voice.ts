import type { Specialization } from './profile';

/**
 * The voice-first contract shared by the app and the API (project map §7–§9).
 *
 * TeleCare+ triage NEVER diagnoses or prescribes. It turns an utterance into a
 * symptom tag set, an urgency lane and a suggested specialty, and a registered
 * doctor makes every medical decision (Telemedicine Practice Guidelines 2020).
 */

/** The three routing lanes. Checked in this order of severity. */
export const URGENCY_LEVELS = ['EMERGENCY', 'URGENT', 'ROUTINE'] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

/** How a voice session ends (voice_sessions.outcome). */
export const VOICE_OUTCOMES = [
  'ROUTINE_BOOKED',
  'URGENT_PAGED',
  'EMERGENCY_ADVISED',
  'ABANDONED',
  'OFFLINE_QUEUED',
] as const;
export type VoiceOutcome = (typeof VOICE_OUTCOMES)[number];

/** Where the audio came in from. */
export const VOICE_CHANNELS = ['APP', 'IVR'] as const;
export type VoiceChannel = (typeof VOICE_CHANNELS)[number];

/**
 * The language the reply is spoken in. These are TTS routes, not ISO codes:
 * - `hi`    Hindi               -> WaveNet hi-IN (or device TTS)
 * - `hi-en` Hinglish (code-mix) -> Sarvam Bulbul, falls back to Hindi
 * - `en`    Indian English      -> WaveNet en-IN
 * - `gbm`   Garhwali            -> recorded clips + Hindi TTS for names/times
 */
export const SPEECH_LANGUAGES = ['hi', 'hi-en', 'en', 'gbm'] as const;
export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number];

/** Map a detected speech language to the patient_profiles.preferred_language enum. */
export const SPEECH_TO_PROFILE_LANGUAGE: Record<SpeechLanguage, string> = {
  hi: 'Hindi',
  'hi-en': 'Hindi',
  en: 'English',
  gbm: 'Garhwali',
};

/**
 * The controlled symptom vocabulary. The LLM MUST pick codes from this list;
 * anything else is rejected and routed to a General Physician. This array is the
 * seed source for the `symptom_tags` and `symptom_tag_specialty` tables (§9) and
 * the matcher reads the same mapping, so the two never drift.
 *
 * `urgency` is the DEFAULT lane for the tag; deterministic red-flag rules
 * (modules/triage/red-flags) can still raise any utterance to EMERGENCY first.
 * A clinician must review this table before real use (project map §14).
 */
export interface SymptomTag {
  code: string;
  labelEn: string;
  labelHi: string;
  /** Null until a native speaker provides it. */
  labelGbm: string | null;
  specialization: Specialization;
  urgency: Urgency;
  /** Children route to Pediatrics regardless of the base specialty. */
  childTo?: Specialization;
}

export const SYMPTOM_TAGS: readonly SymptomTag[] = [
  {
    code: 'fever',
    labelEn: 'Fever',
    labelHi: 'बुखार',
    labelGbm: null,
    specialization: 'General Physician',
    urgency: 'ROUTINE',
    childTo: 'Pediatrics',
  },
  {
    code: 'cough_cold',
    labelEn: 'Cough / cold',
    labelHi: 'खांसी-जुकाम',
    labelGbm: null,
    specialization: 'General Physician',
    urgency: 'ROUTINE',
    childTo: 'Pediatrics',
  },
  {
    code: 'stomach',
    labelEn: 'Stomach ache / loose motion',
    labelHi: 'पेट दर्द / दस्त',
    labelGbm: null,
    specialization: 'General Physician',
    urgency: 'ROUTINE',
    childTo: 'Pediatrics',
  },
  {
    code: 'headache',
    labelEn: 'Headache',
    labelHi: 'सिर दर्द',
    labelGbm: null,
    specialization: 'General Physician',
    urgency: 'ROUTINE',
  },
  {
    code: 'weakness',
    labelEn: 'Weakness / tiredness',
    labelHi: 'कमज़ोरी / थकान',
    labelGbm: null,
    specialization: 'General Physician',
    urgency: 'ROUTINE',
  },
  {
    code: 'rash',
    labelEn: 'Rash / itching',
    labelHi: 'दाने / खुजली',
    labelGbm: null,
    specialization: 'Dermatology',
    urgency: 'ROUTINE',
  },
  {
    code: 'skin_infection',
    labelEn: 'Skin infection',
    labelHi: 'त्वचा संक्रमण',
    labelGbm: null,
    specialization: 'Dermatology',
    urgency: 'ROUTINE',
  },
  {
    code: 'ear_pain',
    labelEn: 'Ear pain',
    labelHi: 'कान दर्द',
    labelGbm: null,
    specialization: 'ENT',
    urgency: 'ROUTINE',
    childTo: 'Pediatrics',
  },
  {
    code: 'throat',
    labelEn: 'Sore throat',
    labelHi: 'गले में दर्द',
    labelGbm: null,
    specialization: 'ENT',
    urgency: 'ROUTINE',
  },
  {
    code: 'joint_pain',
    labelEn: 'Joint / back pain',
    labelHi: 'जोड़ / कमर दर्द',
    labelGbm: null,
    specialization: 'Orthopedics',
    urgency: 'ROUTINE',
  },
  {
    code: 'injury',
    labelEn: 'Sprain / minor injury',
    labelHi: 'मोच / चोट',
    labelGbm: null,
    specialization: 'Orthopedics',
    urgency: 'ROUTINE',
  },
  {
    code: 'period_problem',
    labelEn: 'Menstrual problem',
    labelHi: 'माहवारी की समस्या',
    labelGbm: null,
    specialization: 'Gynecology',
    urgency: 'ROUTINE',
  },
  {
    code: 'pregnancy',
    labelEn: 'Pregnancy concern',
    labelHi: 'गर्भावस्था',
    labelGbm: null,
    specialization: 'Gynecology',
    urgency: 'URGENT',
  },
  {
    code: 'palpitations',
    labelEn: 'Palpitations',
    labelHi: 'धड़कन तेज़',
    labelGbm: null,
    specialization: 'Cardiology',
    urgency: 'URGENT',
  },
  {
    code: 'child_illness',
    labelEn: 'Child is unwell',
    labelHi: 'बच्चा बीमार',
    labelGbm: null,
    specialization: 'Pediatrics',
    urgency: 'ROUTINE',
  },
  {
    code: 'low_mood',
    labelEn: 'Low mood / sleep / anxiety',
    labelHi: 'उदासी / नींद / घबराहट',
    labelGbm: null,
    specialization: 'Psychiatry',
    urgency: 'ROUTINE',
  },
] as const;

export const SYMPTOM_TAG_CODES: readonly string[] = SYMPTOM_TAGS.map((t) => t.code);

/** Plain-language specialty labels for spoken replies (Hindi). */
export const SPECIALIZATION_HI: Record<Specialization, string> = {
  'General Physician': 'सामान्य डॉक्टर',
  Pediatrics: 'बाल रोग',
  Gynecology: 'स्त्री रोग',
  Dermatology: 'त्वचा रोग',
  Orthopedics: 'हड्डी रोग',
  ENT: 'कान-नाक-गला',
  Cardiology: 'हृदय रोग',
  Psychiatry: 'मानसिक स्वास्थ्य',
};

// ---- API DTOs (POST /v1/voice/*) ----

/** Reply from POST /v1/voice/sessions. */
export interface VoiceSessionResponse {
  sessionId: string;
  languagePrior: SpeechLanguage | null;
  promptManifestVersion: number;
}

/** What one voice turn returns to the app (audio sent separately or as a URL). */
export interface VoiceTurnResult {
  turnId: string;
  transcript: string;
  language: SpeechLanguage;
  urgency: Urgency;
  /** Present unless EMERGENCY. */
  specialization: Specialization | null;
  tags: string[];
  /** Spoken reply text (also used by the app's device-TTS fallback). */
  replyText: string;
  /** Deterministic red-flag reason when urgency is EMERGENCY. */
  emergencyReason: string | null;
  /** What the app should do next. */
  nextStep: VoiceNextStep;
  /** AI summary for the doctor, labelled "not a diagnosis". */
  summaryForDoctor: string | null;
}

export const VOICE_NEXT_STEPS = [
  'CONFIRM_SPECIALTY',
  'CHOOSE_SLOT',
  'URGENT_WAIT',
  'EMERGENCY',
  'CLARIFY',
] as const;
export type VoiceNextStep = (typeof VOICE_NEXT_STEPS)[number];
