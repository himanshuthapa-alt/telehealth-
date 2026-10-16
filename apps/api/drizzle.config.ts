import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile();
} catch {
  // no .env file
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/platform/db/schema.ts',
  out: './migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  casing: 'snake_case',
});
