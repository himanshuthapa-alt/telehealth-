import { z } from 'zod';
import { DOCTOR_SOURCES, FULFILLMENT_PROVIDERS } from '@telecare/shared';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Signs access tokens. Generate with: openssl rand -base64 48 */
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    /** hms = real video via 100ms; fake = rooms and tokens without real media (demos, tests); none = chat-only. */
    VIDEO_PROVIDER: z.enum(['hms', 'fake', 'none']).default('fake'),
    /** 100ms credentials (dashboard → Developer). Required when VIDEO_PROVIDER=hms. */
    HMS_ACCESS_KEY: z.string().optional(),
    HMS_APP_SECRET: z.string().optional(),
    HMS_TEMPLATE_ID: z.string().optional(),
    /** Role names in the 100ms template. */
    HMS_DOCTOR_ROLE: z.string().default('host'),
    HMS_PATIENT_ROLE: z.string().default('guest'),
    /** Comma-separated web origins allowed to call the API (the Expo web build). */
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:8081,http://localhost:8082')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
    /** Chatterbox TTS service base URL (text-to-speech voice output). */
    TTS_BASE_URL: z.url().default('http://localhost:4123'),
    /** local = Postgres doctor directory; practo = external partner (stub until credentials exist). */
    DOCTOR_PROVIDER: z.enum(DOCTOR_SOURCES).default('local'),
    /** local = in-house pharmacy queue; partner = external delivery partner (stub until credentials exist). */
    FULFILLMENT_PROVIDER: z.enum(FULFILLMENT_PROVIDERS).default('local'),
  })
  .refine((c) => c.VIDEO_PROVIDER !== 'hms' || (c.HMS_ACCESS_KEY && c.HMS_APP_SECRET && c.HMS_TEMPLATE_ID), {
    message: 'VIDEO_PROVIDER=hms needs HMS_ACCESS_KEY, HMS_APP_SECRET and HMS_TEMPLATE_ID',
    path: ['VIDEO_PROVIDER'],
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
