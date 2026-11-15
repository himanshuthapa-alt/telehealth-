import { z } from 'zod';
import { SPECIALIZATIONS, SPEECH_LANGUAGES, SYMPTOM_TAG_CODES, URGENCY_LEVELS } from '@telecare/shared';

/**
 * The JSON shape the triage LLM must return. Anything outside the controlled
 * vocabulary is rejected here; the service then falls back to safe defaults.
 */
export const TriageOutputSchema = z.object({
  tags: z
    .array(z.enum(SYMPTOM_TAG_CODES as [string, ...string[]]))
    .max(6)
    .default([]),
  urgency: z.enum(URGENCY_LEVELS),
  specialization: z.enum(SPECIALIZATIONS),
  summary_for_doctor: z.string().max(400).default(''),
  reply_text: z.string().max(400).optional(),
  language: z.enum(SPEECH_LANGUAGES).optional(),
  needs_clarification: z.boolean().default(false),
});

export type RawTriageOutput = z.infer<typeof TriageOutputSchema>;
