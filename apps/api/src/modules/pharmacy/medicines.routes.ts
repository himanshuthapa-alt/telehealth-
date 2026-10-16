import { Router } from 'express';
import { z } from 'zod';
import type { AuthGuards } from '../../platform/http/auth';
import { parseQuery } from '../../platform/http/validate';
import type { MedicineCatalog } from './medicines.repository';

const SearchQuery = z.strictObject({ q: z.string().trim().max(60).optional() });

/** The catalog: everyone logged in sees names, prices and whether it's in stock (blueprint §12). */
export function medicineRoutes(catalog: MedicineCatalog, guards: AuthGuards): Router {
  const router = Router();
  router.get('/v1/medicines', guards.requireAuth, async (req, res) => {
    const { q } = parseQuery(SearchQuery, req);
    res.json(await catalog.search(q || undefined, 30));
  });
  return router;
}
