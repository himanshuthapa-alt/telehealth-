import { Router } from 'express';
import type { HealthResponse } from '@telecare/shared';

export interface HealthDeps {
  version: string;
  /** Resolves when the database is reachable. */
  pingDatabase: () => Promise<void>;
}

/**
 * GET /health: liveness + database connectivity. Returns 503 when the
 * database is unreachable so load balancers / the mobile app can tell.
 */
export function healthRoutes({ version, pingDatabase }: HealthDeps): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const database = await pingDatabase().then(
      () => 'up' as const,
      () => 'down' as const,
    );
    const body: HealthResponse = {
      status: database === 'up' ? 'ok' : 'degraded',
      version,
      checks: { database },
    };
    res.status(database === 'up' ? 200 : 503).json(body);
  });

  return router;
}
