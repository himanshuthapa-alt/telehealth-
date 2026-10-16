import { Router } from 'express';
import { z } from 'zod';
import { APPOINTMENT_SCOPES, REASON_NOTE_MAX } from '@telecare/shared';
import { getActor, type AuthGuards } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import { parseBody, parseQuery } from '../../platform/http/validate';
import type { AppointmentService } from './appointments.service';

const BookBody = z.strictObject({
  doctorId: z.uuid('Unknown doctor'),
  startAt: z.iso.datetime({ offset: true, message: 'Use an ISO date-time' }).transform((v) => new Date(v)),
  reasonNote: z
    .string()
    .trim()
    .max(REASON_NOTE_MAX)
    .optional()
    .transform((v) => v || null),
});
const CancelBody = z.strictObject({
  reason: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
});
const ListQuery = z.strictObject({ scope: z.enum(APPOINTMENT_SCOPES).optional() });

export function appointmentRoutes(service: AppointmentService, guards: AuthGuards): Router {
  const router = Router();
  const parties = [guards.requireAuth, guards.requireRole('PATIENT', 'DOCTOR')];
  const notFound = () => new AppError(404, 'NOT_FOUND', 'Appointment not found');
  const appointmentId = (raw: unknown) => {
    const id = z.uuid().safeParse(raw);
    if (!id.success) throw notFound();
    return id.data;
  };

  /** Requires an Idempotency-Key header (a UUID the app makes once per booking attempt). */
  router.post('/v1/appointments', guards.requireAuth, guards.requireRole('PATIENT'), async (req, res) => {
    const key = z.uuid().safeParse(req.get('idempotency-key'));
    if (!key.success)
      throw new AppError(400, 'VALIDATION_FAILED', 'Missing Idempotency-Key header', {
        fields: { 'Idempotency-Key': 'Send a UUID, the same one when retrying' },
      });
    const body = parseBody(BookBody, req);
    const { appointment, created } = await service.book(
      getActor(res),
      { ...body, idempotencyKey: key.data },
      req.ip,
    );
    res.status(created ? 201 : 200).json(appointment);
  });

  router.get('/v1/appointments', ...parties, async (req, res) => {
    const { scope = 'upcoming' } = parseQuery(ListQuery, req);
    res.json(await service.list(getActor(res), scope));
  });

  router.get('/v1/appointments/:id', ...parties, async (req, res) => {
    res.json(await service.get(appointmentId(req.params.id), getActor(res)));
  });

  router.post('/v1/appointments/:id/cancel', ...parties, async (req, res) => {
    const { reason } = parseBody(CancelBody, req);
    res.json(await service.cancel(getActor(res), appointmentId(req.params.id), reason, req.ip));
  });

  return router;
}
