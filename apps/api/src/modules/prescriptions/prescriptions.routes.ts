import { Router, type Request } from 'express';
import { z } from 'zod';
import { FREQUENCY_KEYS } from '@telecare/shared';
import { getActor, type AuthGuards } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import { parseBody } from '../../platform/http/validate';
import type { PrescriptionService } from './prescriptions.service';

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);

const Item = z.strictObject({
  medicineId: z.uuid().nullable(),
  medicineName: text(120),
  dosage: text(60),
  frequency: z
    .enum(FREQUENCY_KEYS as [string, ...string[]])
    .transform((f) => f as (typeof FREQUENCY_KEYS)[number]),
  durationDays: z.number().int().min(1).max(365),
  quantity: z.number().int().min(1).max(1000),
  instructions: optionalText(200),
});
const SaveBody = z.strictObject({
  items: z.array(Item).max(20),
  generalInstructions: optionalText(1000),
  validDays: z.number().int().min(1).max(180),
});
const VoidBody = z.strictObject({
  reason: z.string().trim().min(3, 'Give a short reason').max(200),
  revise: z.boolean().optional(),
});

export function prescriptionRoutes(service: PrescriptionService, guards: AuthGuards): Router {
  const router = Router();
  const parties = [guards.requireAuth, guards.requireRole('PATIENT', 'DOCTOR')];
  const doctor = [guards.requireAuth, guards.requireRole('DOCTOR')];
  const id = (req: Request) => {
    const parsed = z.uuid().safeParse(req.params.id);
    if (!parsed.success) throw new AppError(404, 'NOT_FOUND', 'Not found');
    return parsed.data;
  };

  router.get('/v1/prescriptions', ...parties, async (_req, res) => {
    res.json(await service.list(getActor(res)));
  });
  router.get('/v1/prescriptions/:id', ...parties, async (req, res) => {
    res.json(await service.get(getActor(res), id(req)));
  });
  router.get('/v1/consultations/:id/prescriptions', ...parties, async (req, res) => {
    res.json(await service.forConsultation(getActor(res), id(req)));
  });

  router.post('/v1/consultations/:id/prescription', ...doctor, async (req, res) => {
    res.json(await service.draft(getActor(res), id(req)));
  });
  router.put('/v1/prescriptions/:id', ...doctor, async (req, res) => {
    res.json(await service.save(getActor(res), id(req), parseBody(SaveBody, req)));
  });
  router.post('/v1/prescriptions/:id/issue', ...doctor, async (req, res) => {
    res.json(await service.issue(getActor(res), id(req), req.ip));
  });
  router.post('/v1/prescriptions/:id/void', ...doctor, async (req, res) => {
    const { reason, revise = false } = parseBody(VoidBody, req);
    res.json(await service.void(getActor(res), id(req), reason, revise, req.ip));
  });

  return router;
}
