import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Signs access tokens. Generate with: openssl rand -base64 48 */
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /** fake = rooms and tokens without real media (demos, tests); none = chat-only consultations. */
  VIDEO_PROVIDER: z.enum(['fake', 'none']).default('fake'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
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
