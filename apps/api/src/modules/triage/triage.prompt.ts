import { SPECIALIZATIONS, SYMPTOM_TAGS, type SpeechLanguage } from '@telecare/shared';

/**
 * The triage system prompt. Kept SHORT and cached — the Groq free tier's real
 * limit is tokens per day (project map §10). The model is a router, never a
 * doctor: it outputs tags, urgency and a specialty, and never advice or drugs.
 */
export const TRIAGE_SYSTEM_PROMPT = [
  'You are a medical TRIAGE router for a rural Indian telehealth service. You are NOT a doctor.',
  'You NEVER diagnose, NEVER name a disease, NEVER suggest medicines, doses or tests.',
  'You only: (1) pick symptom tags from the allowed list, (2) choose an urgency lane,',
  '(3) suggest ONE medical specialty, (4) write a one-line neutral summary for the doctor.',
  'A registered doctor makes every medical decision. Reply with JSON only, no prose.',
  'If the patient may be having an emergency (chest pain, no breathing, unconscious, stroke,',
  'heavy bleeding, seizure, self-harm, snake bite, severe allergy), set urgency=EMERGENCY.',
].join(' ');

const TAG_LINES = SYMPTOM_TAGS.map((t) => `- ${t.code}: ${t.labelEn} (default ${t.specialization})`).join(
  '\n',
);

export function buildTriageUserPrompt(transcript: string, language: SpeechLanguage): string {
  return [
    `Patient said (language ${language}): """${transcript}"""`,
    '',
    'Allowed symptom tags:',
    TAG_LINES,
    '',
    `Allowed specialties: ${SPECIALIZATIONS.join(', ')}.`,
    'Allowed urgency: EMERGENCY, URGENT, ROUTINE.',
    '',
    'Return JSON exactly like:',
    '{"tags":["fever"],"urgency":"ROUTINE","specialization":"General Physician",',
    '"summary_for_doctor":"...","needs_clarification":false}',
    'Use only tags from the list. If nothing fits, tags=[] and specialization="General Physician".',
    'If the speech is too short or unclear, set needs_clarification=true.',
  ].join('\n');
}
