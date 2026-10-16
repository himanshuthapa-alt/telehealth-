import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client';

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../migrations',
);

export async function runMigrations(databaseUrl: string): Promise<void> {
  const database = createDatabase(databaseUrl);
  try {
    await migrate(database.db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await database.close();
  }
}

// `npm run db:migrate` entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file: rely on the real environment
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set (see apps/api/.env.example)');
    process.exit(1);
  }
  await runMigrations(url);
  // eslint-disable-next-line no-console -- CLI output
  console.log(`Migrations applied from ${MIGRATIONS_DIR}`);
}
