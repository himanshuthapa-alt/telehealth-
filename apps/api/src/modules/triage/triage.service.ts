import {
  SPECIALIZATIONS,
  SPECIALIZATION_HI,
  SYMPTOM_TAGS,
  type SpeechLanguage,
  type Specialization,
  type Urgency,
} from '@telecare/shared';
import { checkRedFlags } from './red-flags';
import { readsAsAdvice } from './output-guard';
import { resolveRouting, type TriageLlm } from './triage-llm';

export interface TriageDecision {
  urgency: Urgency;
  /** Null only for EMERGENCY. */
  specialization: Specialization | null;
  tags: string[];
  summaryForDoctor: string | null;
  replyText: string;
  emergencyReason: string | null;
  ruleHits: string[];
  needsClarification: boolean;
  /** Which engine decided: 'rules' | 'groq' | 'fake'. */
  engine: string;
}

export interface TriageServiceDeps {
  /** Primary engine (Groq in production). */
  llm: TriageLlm;
  /** Deterministic fallback when the primary fails (always the fake matcher). */
  fallback: TriageLlm;
  promptVersion: string;
  logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void };
}

const TAG_LABEL = new Map(SYMPTOM_TAGS.map((t) => [t.code, t]));
const VALID_SPEC = new Set<string>(SPECIALIZATIONS);

export function emergencyReply(language: SpeechLanguage): string {
  return language === 'en'
    ? 'This may be an emergency. Call 112, or 108 for an ambulance, right now.'
    : 'यह इमरजेंसी हो सकती है। अभी 112 या एम्बुलेंस के लिए 108 पर कॉल करें।';
}

function clarifyReply(language: SpeechLanguage): string {
  return language === 'en'
    ? 'Sorry, I did not catch that. Please say your problem again.'
    : 'माफ़ कीजिए, समझ नहीं आया। अपनी तकलीफ़ दोबारा बताइए।';
}

/** Neutral, template-only reply — never a diagnosis or a medicine. */
export function buildReply(
  language: SpeechLanguage,
  specialization: Specialization,
  tags: string[],
  urgency: Urgency,
): string {
  if (language === 'en') {
    const sym = tags
      .map((c) => TAG_LABEL.get(c)?.labelEn)
      .filter(Boolean)
      .join(' and ');
    let s = sym ? `You mentioned ${sym}. ` : '';
    s += `It is best to talk to a ${specialization}. `;
    if (urgency === 'URGENT') s += 'This looks important — I am finding an available doctor now. ';
    return s + 'Here are doctors who can help.';
  }
  const specHi = SPECIALIZATION_HI[specialization];
  const sym = tags
    .map((c) => TAG_LABEL.get(c)?.labelHi)
    .filter(Boolean)
    .join(' और ');
  let s = sym ? `आपने ${sym} बताई। ` : '';
  s += `${specHi} से बात करना ठीक रहेगा। `;
  if (urgency === 'URGENT') s += 'यह ज़रूरी लग रहा है, मैं अभी डॉक्टर उपलब्ध करा रहा हूँ। ';
  return s + 'ये डॉक्टर उपलब्ध हैं।';
}

/**
 * Orchestrates one triage: deterministic red-flags FIRST, then the LLM (with a
 * deterministic fallback), then validation and a template reply. The LLM can
 * also raise an emergency; either signal is enough (project map §6).
 */
export function createTriageService(deps: TriageServiceDeps) {
  return {
    async triage(input: { transcript: string; language: SpeechLanguage }): Promise<TriageDecision> {
      const { transcript, language } = input;

      // 1. Deterministic emergency check — before any model runs.
      const red = checkRedFlags(transcript);
      if (red.hit) {
        return {
          urgency: 'EMERGENCY',
          specialization: null,
          tags: [],
          summaryForDoctor: null,
          replyText: emergencyReply(language),
          emergencyReason: red.reason,
          ruleHits: red.ruleHits,
          needsClarification: false,
          engine: 'rules',
        };
      }

      // 2. LLM triage, falling back to the deterministic matcher.
      let out;
      let engine = deps.llm.name;
      try {
        out = await deps.llm.triage({ transcript, language });
      } catch (err) {
        deps.logger?.warn('triage llm failed, using fallback', { error: String(err) });
        out = await deps.fallback.triage({ transcript, language });
        engine = deps.fallback.name;
      }

      // 2b. The model may also flag an emergency.
      if (out.urgency === 'EMERGENCY') {
        return {
          urgency: 'EMERGENCY',
          specialization: null,
          tags: [],
          summaryForDoctor: null,
          replyText: emergencyReply(language),
          emergencyReason: 'Flagged by triage model',
          ruleHits: [],
          needsClarification: false,
          engine,
        };
      }

      // 3. Validate against the controlled vocabulary.
      const tags = out.tags.filter((c) => TAG_LABEL.has(c));
      let specialization: Specialization = VALID_SPEC.has(out.specialization)
        ? out.specialization
        : 'General Physician';
      let urgency: Urgency = out.urgency === 'URGENT' ? 'URGENT' : 'ROUTINE';
      // Trust the vocabulary mapping over a free-form specialty when we have tags.
      if (tags.length > 0) {
        const routed = resolveRouting(tags);
        specialization = routed.specialization;
        if (routed.urgency === 'URGENT') urgency = 'URGENT';
      }

      if (out.needsClarification) {
        return {
          urgency: 'ROUTINE',
          specialization,
          tags,
          summaryForDoctor: out.summaryForDoctor || null,
          replyText: clarifyReply(language),
          emergencyReason: null,
          ruleHits: [],
          needsClarification: true,
          engine,
        };
      }

      // 4. Safe reply: template unless the model's reply passes the advice guard.
      let replyText = buildReply(language, specialization, tags, urgency);
      if (out.replyText && !readsAsAdvice(out.replyText)) replyText = out.replyText;

      return {
        urgency,
        specialization,
        tags,
        summaryForDoctor: out.summaryForDoctor || null,
        replyText,
        emergencyReason: null,
        ruleHits: [],
        needsClarification: false,
        engine,
      };
    },
  };
}

export type TriageService = ReturnType<typeof createTriageService>;
