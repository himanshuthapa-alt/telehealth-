import { Router } from 'express';
import { z } from 'zod';
import { DOCTOR_AVAILABILITY_FILTERS, DOCTOR_SORTS, LANGUAGES, SPECIALIZATIONS } from '@telecare/shared';
import type { AuthGuards } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import { parseQuery } from '../../platform/http/validate';
import type { DoctorDirectory } from './discovery.repository';

const SearchQuery = z.strictObject({
  q: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => v || undefined),
  specialization: z.enum(SPECIALIZATIONS).optional(),
  language: z.enum(LANGUAGES).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  available: z.enum(DOCTOR_AVAILABILITY_FILTERS).optional(),
  sort: z.enum(DOCTOR_SORTS).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
});

/** Doctor search and public profiles: patients and doctors (blueprint §12). */
export function discoveryRoutes(directory: DoctorDirectory, guards: AuthGuards): Router {
  const router = Router();
  const allowed = [guards.requireAuth, guards.requireRole('PATIENT', 'DOCTOR')];

  router.get('/v1/doctors', ...allowed, async (req, res) => {
    res.json(await directory.search(parseQuery(SearchQuery, req)));
  });

  router.get('/v1/doctors/:id', ...allowed, async (req, res) => {
    const id = String(req.params.id);
    // A malformed id can't match any doctor; answer like any other unknown id.
    const doctor = z.uuid().safeParse(id).success ? await directory.get(id) : null;
    if (!doctor) throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
    res.json(doctor);
  });

  return router;
}
