import { Router } from 'express';
import { z } from 'zod';
import { GENDERS, LANGUAGES } from '@telecare/shared';
import { getActor, type AuthGuards } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import { parseBody } from '../../platform/http/validate';
import type { PatientProfileRepository } from './patient-profile.repository';

const MAX_AGE_YEARS = 120;

const dateOfBirth = z.iso.date('Use the format YYYY-MM-DD').refine((value) => {
  const born = new Date(`${value}T00:00:00Z`);
  const oldest = new Date();
  oldest.setUTCFullYear(oldest.getUTCFullYear() - MAX_AGE_YEARS);
  return born <= new Date() && born >= oldest;
}, 'Enter a real date of birth');

const UpdateProfileBody = z
  .strictObject({
    fullName: z.string().trim().min(2, 'Enter your full name').max(100),
    dateOfBirth: dateOfBirth.nullable(),
    gender: z.enum(GENDERS).nullable(),
    preferredLanguage: z.enum(LANGUAGES).nullable(),
    district: z
      .string()
      .trim()
      .max(80)
      .transform((value) => value || null)
      .nullable(),
  })
  .partial();

/** The logged-in patient's own profile. "Own" comes from the token, so there is no id to tamper with. */
export function usersRoutes(profiles: PatientProfileRepository, guards: AuthGuards): Router {
  const router = Router();
  const patientOnly = [guards.requireAuth, guards.requireRole('PATIENT')];
  const notFound = () => new AppError(404, 'NOT_FOUND', 'Profile not found');

  router.get('/v1/me/profile', ...patientOnly, async (_req, res) => {
    const profile = await profiles.get(getActor(res).id);
    if (!profile) throw notFound();
    res.json(profile);
  });

  router.patch('/v1/me/profile', ...patientOnly, async (req, res) => {
    const patch = parseBody(UpdateProfileBody, req);
    const updated = await profiles.update(getActor(res).id, patch);
    if (!updated) throw notFound();
    res.json(updated);
  });

  return router;
}
