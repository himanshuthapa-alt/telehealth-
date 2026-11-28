import { Router } from 'express';
import { z } from 'zod';
import { getActor, type AuthGuards } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import { parseBody, parseQuery } from '../../platform/http/validate';
import type { MedicineCatalog } from './medicines.repository';

const SearchQuery = z.strictObject({ q: z.string().trim().max(60).optional() });
const StockBody = z.strictObject({
  delta: z
    .number()
    .int()
    .min(-10_000)
    .max(10_000)
    .refine((d) => d !== 0, 'Enter a change other than 0'),
});

/**
 * The catalog: everyone logged in sees names, prices and whether it's in stock;
 * pharmacy staff also see exact stock and can correct it (blueprint §12, J9).
 */
export function medicineRoutes(catalog: MedicineCatalog, guards: AuthGuards): Router {
  const router = Router();
  router.get('/v1/medicines', guards.requireAuth, async (req, res) => {
    const { q } = parseQuery(SearchQuery, req);
    const staff = getActor(res).role === 'PHARMACY_ADMIN';
    res.json(await catalog.search(q || undefined, staff ? 200 : 30, staff));
  });

  router.post('/v1/medicines/:id/stock', guards.requireRole('PHARMACY_ADMIN'), async (req, res) => {
    const id = String(req.params.id);
    if (!z.uuid().safeParse(id).success) throw new AppError(404, 'NOT_FOUND', 'Medicine not found');
    const { delta } = parseBody(StockBody, req);
    res.json(await catalog.adjustStock(id, delta, getActor(res).id));
  });
  return router;
}
