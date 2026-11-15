import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Signs access tokens. Generate with: openssl rand -base64 48 */
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    /** fake = rooms and tokens without real media (demos, tests); none = chat-only consultations. */
    VIDEO_PROVIDER: z.enum(['fake', 'none']).default('fake'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

    // ---- Voice-first stack (project map §8.4). Every provider has a `fake` mode,
    // so the whole system runs for tests and the demo with no keys and no cost. ----
    /** Speech-to-text. groq = Whisper (free tier); fake = canned transcript for demos/tests. */
    STT_PROVIDER: z.enum(['groq', 'sarvam', 'fake']).default('fake'),
    /** Symptom triage. groq = gpt-oss-120b (free tier); fake = deterministic keyword matcher. */
    LLM_PROVIDER: z.enum(['groq', 'fake']).default('fake'),
    /** Text-to-speech. device = app speaks it; fake = no audio (text only). */
    TTS_PROVIDER: z.enum(['google', 'sarvam', 'device', 'fake']).default('fake'),
    /** Urgent paging / masked callbacks. */
    TELEPHONY_PROVIDER: z.enum(['exotel', 'fake', 'none']).default('fake'),

    GROQ_API_KEY: z.string().min(1).optional(),
    GROQ_STT_MODEL: z.string().default('whisper-large-v3-turbo'),
    GROQ_LLM_MODEL: z.string().default('openai/gpt-oss-120b'),
    /** Google Cloud TTS API key (WaveNet hi-IN / en-IN). */
    GCP_TTS_KEY: z.string().min(1).optional(),
    SARVAM_API_KEY: z.string().min(1).optional(),

    /** Hours to keep raw symptom audio server-side. 0 = never stored (DPDP default). */
    VOICE_AUDIO_RETENTION_HOURS: z.coerce.number().int().min(0).max(72).default(0),
    /** Bumped when the triage prompt changes, for auditing which prompt produced a result. */
    TRIAGE_PROMPT_VERSION: z.string().default('v1'),
  })
  .refine((c) => c.STT_PROVIDER !== 'groq' || !!c.GROQ_API_KEY, {
    error: 'GROQ_API_KEY is required when STT_PROVIDER=groq',
    path: ['GROQ_API_KEY'],
  })
  .refine((c) => c.LLM_PROVIDER !== 'groq' || !!c.GROQ_API_KEY, {
    error: 'GROQ_API_KEY is required when LLM_PROVIDER=groq',
    path: ['GROQ_API_KEY'],
  })
  .refine((c) => c.TTS_PROVIDER !== 'google' || !!c.GCP_TTS_KEY, {
    error: 'GCP_TTS_KEY is required when TTS_PROVIDER=google',
    path: ['GCP_TTS_KEY'],
  });

export type Config = z.infer<typeof EnvSchema>;

/**
 * Validates configuration once at startup. The server refuses to boot with
 * missing or malformed config instead of failing later on first use.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${problems}\nSee apps/api/.env.example`);
  }
  return result.data;
}
