import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  /** Comma-separated browser app origins allowed in production. */
  WEB_ORIGINS: z.string().default(''),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Signs access tokens. Generate with: openssl rand -base64 48 */
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** fake = rooms and tokens without real media (demos, tests); none = chat-only consultations. */
  VIDEO_PROVIDER: z.enum(['fake', 'none']).default('fake'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  /** test prevents real third-party calls; set live only after configuring service keys. */
  EXTERNAL_SERVICES_MODE: z.enum(['test', 'live']).default('test'),
  /** Groq API Key for Whisper STT and gpt-oss-120b triage routing (optional). */
  GROQ_API_KEY: z.string().optional(),
  /** Groq multilingual speech recognition model. */
  GROQ_WHISPER_MODEL: z.string().default('whisper-large-v3-turbo'),
  /** Maximum Groq requests this API process may make per UTC day. */
  GROQ_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(100_000).default(300),
  /** Emit one API warning after this fraction of the daily request budget is used. */
  GROQ_BUDGET_WARNING_RATIO: z.coerce.number().min(0.1).max(1).default(0.8),
  /** Optional Google Cloud Text-to-Speech API key for Hindi WaveNet audio. */
  GOOGLE_TTS_API_KEY: z.string().optional(),
  /** Optional Sarvam API subscription key for Hinglish speech. */
  SARVAM_API_KEY: z.string().optional(),
  /** Model for triage symptom classification (defaults to gpt-oss-120b). */
  TRIAGE_MODEL: z.string().default('openai/gpt-oss-120b'),
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
