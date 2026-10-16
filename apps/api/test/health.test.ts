import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HealthResponse } from '@telecare/shared';
import { createDatabase, type DatabaseHandle } from '../src/platform/db/client';
import { listen, testApp, testDatabaseUrl } from './helpers';

describe('GET /health', () => {
  let database: DatabaseHandle;

  beforeAll(() => {
    database = createDatabase(testDatabaseUrl());
  });
  afterAll(async () => {
    await database.close();
  });

  it('reports ok when the real database is reachable', async () => {
    const server = await listen(testApp({ version: '1.2.3', pingDatabase: database.ping }).app);
    try {
      const res = await fetch(`${server.url}/health`);
      expect(res.status).toBe(200);
      expect((await res.json()) as HealthResponse).toEqual({
        status: 'ok',
        version: '1.2.3',
        checks: { database: 'up' },
      });
    } finally {
      await server.close();
    }
  });

  it('reports degraded with 503 when the database is unreachable', async () => {
    const pingDatabase = () => Promise.reject(new Error('connection refused'));
    const server = await listen(testApp({ version: '1.2.3', pingDatabase }).app);
    try {
      const res = await fetch(`${server.url}/health`);
      expect(res.status).toBe(503);
      expect(((await res.json()) as HealthResponse).checks.database).toBe('down');
    } finally {
      await server.close();
    }
  });
});

describe('database connection loss', () => {
  it('survives an idle connection being terminated and reconnects', async () => {
    const errors: Error[] = [];
    const database = createDatabase(testDatabaseUrl(), (err) => errors.push(err));
    try {
      // Open a pooled connection, remember its server process id, and let it go idle.
      const { rows } = await database.db.$client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      // Terminate exactly that connection from outside, as a database restart would.
      const admin = createDatabase(testDatabaseUrl());
      await admin.db.$client.query('SELECT pg_terminate_backend($1)', [rows[0]!.pid]);
      await admin.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errors.length).toBeGreaterThan(0); // handled, not thrown
      await expect(database.ping()).resolves.toBeUndefined(); // reconnected
    } finally {
      await database.close();
    }
  });
});
