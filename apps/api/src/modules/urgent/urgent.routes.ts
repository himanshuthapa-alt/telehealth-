import { Router } from 'express';
import { LANGUAGES } from '@telecare/shared';
import { z } from 'zod';
import { getActor, type AuthGuards } from '../../platform/http/auth';
import { createRateLimiter } from '../../platform/http/rate-limit';
import { AppError } from '../../platform/http/errors';
import { parseBody } from '../../platform/http/validate';
import type { UrgentRequestService } from './urgent.service';
import type { UrgentRequestRow } from './urgent.repository';

const CreateBody = z.strictObject({
  symptoms: z.string().trim().min(2).max(1000),
  language: z.enum(LANGUAGES).nullable().optional(),
});
const OnCallBody = z.strictObject({ isOnCall: z.boolean() });

const requestId = (raw: unknown) => {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw new AppError(404, 'NOT_FOUND', 'Urgent request not found');
  return parsed.data;
};

const publicRequest = ({
  candidateDoctorIds: _candidates,
  candidateIndex: _index,
  patientId: _patientId,
  assignedDoctorId: _assignedDoctorId,
  ...row
}: UrgentRequestRow) => row;

export function urgentRequestRoutes(service: UrgentRequestService, guards: AuthGuards): Router {
  const router = Router();
  const patientOnly = [guards.requireAuth, guards.requireRole('PATIENT')];
  const doctorOnly = [guards.requireAuth, guards.requireRole('DOCTOR')];
  const requestRate = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

  router.post('/v1/urgent-requests', ...patientOnly, async (req, res) => {
    const actor = getActor(res);
    requestRate.hit(actor.id);
    const key = z.uuid().safeParse(req.get('idempotency-key'));
    if (!key.success) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Missing Idempotency-Key header', {
        fields: { 'Idempotency-Key': 'Send a UUID and reuse it when retrying this request' },
      });
    }
    const body = parseBody(CreateBody, req);
    const result = await service.create(
      actor,
      { symptoms: body.symptoms, language: body.language ?? null },
      key.data,
      req.ip,
    );
    res.status(result.request ? 201 : 200).json({
      ...result,
      request: result.request ? publicRequest(result.request) : null,
    });
  });

  router.get('/v1/urgent-requests/:id', ...patientOnly, async (req, res) => {
    res.json(publicRequest(await service.getForPatient(requestId(req.params.id), getActor(res).id)));
  });

  router.post('/v1/urgent-requests/:id/cancel', ...patientOnly, async (req, res) => {
    res.json(publicRequest(await service.cancel(requestId(req.params.id), getActor(res), req.ip)));
  });

  router.get('/v1/doctor/on-call', ...doctorOnly, async (_req, res) => {
    res.json(await service.onCallStatus(getActor(res).id));
  });

  router.put('/v1/doctor/on-call', ...doctorOnly, async (req, res) => {
    const { isOnCall } = parseBody(OnCallBody, req);
    res.json(await service.setOnCall(getActor(res), isOnCall, req.ip));
  });

  router.get('/v1/doctor/urgent-requests', ...doctorOnly, async (_req, res) => {
    res.json(
      (await service.listForDoctor(getActor(res).id)).map(({ request, ...item }) => ({
        ...item,
        request: publicRequest(request),
      })),
    );
  });

  router.post('/v1/doctor/urgent-requests/:id/accept', ...doctorOnly, async (req, res) => {
    res.json(publicRequest(await service.accept(requestId(req.params.id), getActor(res), req.ip)));
  });

  router.post('/v1/doctor/urgent-requests/:id/decline', ...doctorOnly, async (req, res) => {
    res.json(publicRequest(await service.decline(requestId(req.params.id), getActor(res), req.ip)));
  });

  return router;
}
