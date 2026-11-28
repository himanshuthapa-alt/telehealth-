import { Router } from 'express';
import { z } from 'zod';
import { DOCTOR_VERIFICATION_STATUSES, LANGUAGES, SPECIALIZATIONS } from '@telecare/shared';
import { getActor, type AuthGuards } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import { parseBody, parseQuery } from '../../platform/http/validate';
import type { AuditLog } from '../audit/audit';
import type { DoctorProfileRepository } from './doctor-profile.repository';

/** The fields a doctor fills in at sign-up and can edit later. Shared with POST /v1/auth/register/doctor. */
export const doctorFields = {
  qualification: z.string().trim().min(2, 'Enter your qualification, e.g. MBBS, MD').max(120),
  specializations: z
    .array(z.enum(SPECIALIZATIONS))
    .min(1, 'Choose at least one specialization')
    .max(SPECIALIZATIONS.length)
    .transform((list) => [...new Set(list)]),
  languages: z
    .array(z.enum(LANGUAGES))
    .min(1, 'Choose at least one language')
    .max(LANGUAGES.length)
    .transform((list) => [...new Set(list)]),
  experienceYears: z.number().int().min(0, 'Enter years of experience').max(70),
  feeInr: z.number().int().min(0, 'Fee cannot be negative').max(100_000),
  bio: z.string().trim().max(1000),
};

/** Indian medical council numbers vary by state; allow letters, digits, / and -. */
export const registrationNumber = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9/-]{3,30}$/, 'Enter your medical council registration number');

const UpdateBody = z.strictObject(doctorFields).partial();
const ReviewQuery = z.strictObject({ status: z.enum(DOCTOR_VERIFICATION_STATUSES).default('PENDING') });
const DecisionBody = z
  .strictObject({
    status: z.enum(['APPROVED', 'REJECTED']),
    note: z.string().trim().max(300).optional(),
  })
  .refine((b) => b.status === 'APPROVED' || !!b.note, {
    message: 'Tell the doctor why, so they can fix it',
    path: ['note'],
  });

export function doctorProfileRoutes(
  profiles: DoctorProfileRepository,
  audit: AuditLog,
  guards: AuthGuards,
): Router {
  const router = Router();
  const doctorOnly = [guards.requireAuth, guards.requireRole('DOCTOR')];
  // Unverified doctors may still see and fix their own profile.
  const ownAccount = [guards.requireAuth, guards.requireDoctorAccount];
  const adminOnly = [guards.requireAuth, guards.requireRole('ADMIN')];
  const notFound = () => new AppError(404, 'NOT_FOUND', 'Doctor profile not found');

  router.get('/v1/me/doctor-profile', ...ownAccount, async (_req, res) => {
    const profile = await profiles.getOwn(getActor(res).id);
    if (!profile) throw notFound();
    res.json(profile);
  });

  router.patch('/v1/me/doctor-profile', ...ownAccount, async (req, res) => {
    const patch = parseBody(UpdateBody, req);
    const profile = await profiles.updateOwn(getActor(res).id, patch);
    if (!profile) throw notFound();
    res.json(profile);
  });

  router.get('/v1/me/doctor-stats', ...doctorOnly, async (_req, res) => {
    res.json(await profiles.stats(getActor(res).id));
  });

  router.get('/v1/admin/doctors', ...adminOnly, async (req, res) => {
    const { status } = parseQuery(ReviewQuery, req);
    res.json(await profiles.listForReview(status));
  });

  router.post('/v1/admin/doctors/:id/verification', ...adminOnly, async (req, res) => {
    const id = String(req.params.id);
    if (!z.uuid().safeParse(id).success) throw notFound();
    const body = parseBody(DecisionBody, req);
    const note = body.status === 'REJECTED' ? (body.note ?? null) : null;
    if (!(await profiles.setVerification(id, body.status, note))) throw notFound();
    const actor = getActor(res);
    await audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'DOCTOR_VERIFICATION_CHANGED',
      entityType: 'doctor',
      entityId: id,
      metadata: { status: body.status },
      ip: req.ip,
    });
    res.status(204).end();
  });

  return router;
}
