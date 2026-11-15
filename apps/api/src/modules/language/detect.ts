import type { SpeechLanguage } from '@telecare/shared';
import { countGarhwaliMarkers } from './garhwali-markers';

export interface DetectInput {
  /** Language id returned by the STT provider (ISO-ish: 'hi', 'en', 'ur', 'ne', …). */
  sttLanguage?: string | null;
  transcript: string;
  /** patient_profiles.preferred_language mapped to a speech code, used as a prior. */
  profilePrior?: SpeechLanguage | null;
  /** Language the triage LLM reported (optional second opinion). */
  llmLanguage?: SpeechLanguage | null;
}

export interface DetectResult {
  language: SpeechLanguage;
  /** 0–1. Low confidence means "ask the patient once and remember". */
  confidence: number;
}

// Roman-Hindi lexicon: if these appear in Latin script, it's Hinglish, not English.
const ROMAN_HINDI =
  /\b(hai|hain|mujhe|mere|mera|meri|dard|bukhar|nahi|nahin|kyun|kaise|raha|rahi|rhi|ho|gaya|gayi|bacche|bachche|baccha|kaan|pet|khansi|ko|se|me|mein|ho rha|tez|theek|aa rahi|aaraha)\b/i;

function scripts(text: string): { dev: number; latin: number } {
  const dev = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const latin = (text.match(/[a-z]/gi) ?? []).length;
  return { dev, latin };
}

/**
 * Decide the reply language from the transcript, the STT label, the profile prior
 * and (optionally) the LLM label (project map §7.3).
 *
 * Whisper labels Hinglish as 'hi' or 'en', so Hinglish is decided from the
 * transcript (roman-Hindi words in Latin script), not from the STT label.
 */
export function detectLanguage(input: DetectInput): DetectResult {
  const text = (input.transcript ?? '').trim();
  const { dev, latin } = scripts(text);

  let candidate: SpeechLanguage;
  if (dev >= 2 && countGarhwaliMarkers(text) >= 1) candidate = 'gbm';
  else if (dev >= 2 && latin < 3) candidate = 'hi';
  else if (latin >= 3 && ROMAN_HINDI.test(text)) candidate = 'hi-en';
  else if (dev >= 1 && latin >= 3) candidate = 'hi-en';
  else if (latin >= 3) candidate = 'en';
  else candidate = input.profilePrior ?? 'hi';

  // Confidence: agreement across signals raises it; disagreement lowers it so the
  // caller asks once and stores the answer.
  let confidence = text.length < 4 ? 0.3 : 0.6;
  const sttSaysHindiFamily = ['hi', 'ur', 'ne', 'mr'].includes((input.sttLanguage ?? '').toLowerCase());
  const sttSaysEnglish = (input.sttLanguage ?? '').toLowerCase() === 'en';
  if (candidate === 'hi' && sttSaysHindiFamily) confidence += 0.25;
  if (candidate === 'en' && sttSaysEnglish) confidence += 0.25;
  if (input.llmLanguage && input.llmLanguage === candidate) confidence += 0.15;
  if (input.profilePrior && input.profilePrior === candidate) confidence += 0.1;
  // Garhwali detection is weak by design; never claim high confidence.
  if (candidate === 'gbm') confidence = Math.min(confidence, 0.5);

  return { language: candidate, confidence: Math.min(1, Number(confidence.toFixed(2))) };
}
