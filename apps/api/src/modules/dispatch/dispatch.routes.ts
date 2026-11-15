import { Router } from 'express';
import { z } from 'zod';
import type { AuthGuards } from '../../platform/http/auth';
import { getActor } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import { parseBody } from '../../platform/http/validate';
import type { DispatchService } from './dispatch.service';
import type { DispatchRepository } from './dispatch.repository';

const OnCallBody = z.strictObject({ onCall: z.boolean() });

/** Doctor-facing urgent-paging routes (project map §8.3). */
export function dispatchRoutes(
  service: DispatchService,
  repo: DispatchRepository,
  guards: AuthGuards,
): Router {
  const router = Router();
  const doctor = [guards.requireAuth, guards.requireRole('DOCTOR')];

  // Accept / decline an urgent page (IVR webhook or a tap in the doctor app).
  router.post('/v1/dispatch/:id/accept', ...doctor, async (req, res) => {
    const ok = await service.respond(idOf(req.params.id), true);
    if (!ok) throw new AppError(404, 'NOT_FOUND', 'Page not found');
    res.json({ status: 'ACCEPTED' });
  });

  router.post('/v1/dispatch/:id/decline', ...doctor, async (req, res) => {
    const ok = await service.respond(idOf(req.params.id), false);
    if (!ok) throw new AppError(404, 'NOT_FOUND', 'Page not found');
    res.json({ status: 'DECLINED' });
  });

  // On-call toggle.
  router.patch('/v1/me/on-call', ...doctor, async (req, res) => {
    const body = parseBody(OnCallBody, req);
    const actor = getActor(res);
    const ok = await repo.setOnCall(actor.id, body.onCall);
    if (!ok) throw new AppError(404, 'NOT_FOUND', 'Doctor profile not found');
    res.json({ onCall: body.onCall });
  });

  return router;
}

function idOf(raw: unknown): string {
  const id = String(raw);
  if (!z.uuid().safeParse(id).success) throw new AppError(404, 'NOT_FOUND', 'Page not found');
  return id;
}
