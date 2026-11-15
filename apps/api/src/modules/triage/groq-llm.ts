import type { TriageLlm, TriageLlmOutput } from './triage-llm';
import { TriageOutputSchema } from './triage-output.schema';
import { TRIAGE_SYSTEM_PROMPT, buildTriageUserPrompt } from './triage.prompt';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface GroqLlmConfig {
  apiKey: string;
  model: string;
  /** Falls back to this model on a 429/5xx (project map §11: gpt-oss-20b). */
  fallbackModel?: string;
  timeoutMs?: number;
}

/**
 * Real triage via Groq's OpenAI-compatible chat API (gpt-oss-120b, free tier).
 * Throws on any failure so the service can fall back to the deterministic matcher.
 */
export function createGroqTriageLlm(config: GroqLlmConfig): TriageLlm {
  const timeout = config.timeoutMs ?? 8000;

  async function call(
    model: string,
    transcript: string,
    language: Parameters<TriageLlm['triage']>[0]['language'],
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 300,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
            { role: 'user', content: buildTriageUserPrompt(transcript, language) },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Groq LLM ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Groq LLM empty response');
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: 'groq',
    triage: async ({ transcript, language }): Promise<TriageLlmOutput> => {
      let content: string;
      try {
        content = await call(config.model, transcript, language);
      } catch (err) {
        if (!config.fallbackModel) throw err;
        content = await call(config.fallbackModel, transcript, language);
      }
      const parsed = TriageOutputSchema.parse(JSON.parse(content));
      return {
        tags: parsed.tags,
        urgency: parsed.urgency,
        specialization: parsed.specialization,
        summaryForDoctor: parsed.summary_for_doctor,
        replyText: parsed.reply_text,
        language: parsed.language,
        needsClarification: parsed.needs_clarification,
      };
    },
  };
}
