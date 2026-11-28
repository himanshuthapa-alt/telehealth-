import { and, eq, sql } from 'drizzle-orm';
import { medicines } from './modules/pharmacy/pharmacy.schema';
import { createDatabase } from './platform/db/client';
import { SEED_MEDICINES } from './seed-medicines';

/**
 * Puts a demo server back to a clean state before a rehearsal or the viva:
 * removes every booking, consultation, chat, prescription and order, and
 * restores the demo pharmacy's stock. Accounts, doctor profiles, hours and the
 * audit log are kept (the audit log is append-only by design).
 *
 *   npm run db:demo-reset -- --confirm
 */
try {
  process.loadEnvFile();
} catch {
  // no .env file
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (see apps/api/.env.example)');
  process.exit(1);
}
const host = new URL(url).host;
if (process.env.NODE_ENV === 'production' || !process.argv.includes('--confirm')) {
  console.error(
    `This deletes ALL bookings, consultations, prescriptions and orders on ${host}.\n` +
      'Run with --confirm (and never with NODE_ENV=production).',
  );
  process.exit(1);
}

const database = createDatabase(url);
try {
  await database.db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE order_status_history, order_items, stock_movements, orders,
      prescription_items, prescriptions, messages, consultation_events, consultations, appointments`);
    for (const m of SEED_MEDICINES)
      await tx
        .update(medicines)
        .set({ stockQty: m.stockQty })
        .where(and(eq(medicines.name, m.name), eq(medicines.isDemo, true)));
  });
  // eslint-disable-next-line no-console -- CLI output
  console.log(`Demo data reset on ${host}. Accounts, doctors and hours kept.`);
} finally {
  await database.close();
}
