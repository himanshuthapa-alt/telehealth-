import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export type Database = ReturnType<typeof drizzle>;

/**
 * The PostgreSQL connection. Only repository implementations and platform
 * code should import `db`; business rules depend on repository interfaces
 * so the persistence layer stays replaceable (blueprint decision D1).
 */
export function createDatabase(connectionString: string, onIdleClientError?: (err: Error) => void) {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5_000 });
  // An idle connection can die (database restart, network drop). Without this
  // listener the 'error' event is unhandled and crashes the whole process;
  // with it, pg discards the broken client and the next query reconnects.
  pool.on('error', (err) => onIdleClientError?.(err));
  const db = drizzle({ client: pool, casing: 'snake_case' });

  return {
    db,
    /** Resolves if the database answers, rejects otherwise. */
    async ping(): Promise<void> {
      await pool.query('SELECT 1');
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

export type DatabaseHandle = ReturnType<typeof createDatabase>;

/** The database or an open transaction: repositories accept either. */
export type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
