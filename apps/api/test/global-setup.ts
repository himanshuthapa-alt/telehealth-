import pg from 'pg';
import { runMigrations } from '../src/platform/db/migrate';

/**
 * Once before the whole test run: bring the test database schema up to date,
 * then empty every table, so each run starts clean. (Leftovers from earlier
 * runs once pushed a test's doctor off the first page of search results.)
 */
export default async function setup() {
  try {
    process.loadEnvFile();
  } catch {
    // CI provides TEST_DATABASE_URL directly
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see apps/api/.env.example)');
  if (!/_test\b/.test(new URL(url).pathname))
    throw new Error(`Refusing to empty a database whose name doesn't end in _test: ${new URL(url).pathname}`);

  await runMigrations(url);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>(
      `SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'`,
    );
    // TRUNCATE doesn't fire DELETE triggers, so the append-only audit table is cleared too (tests only).
    if (rows.length)
      await client.query(`TRUNCATE ${rows.map((r) => r.name).join(', ')} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}
