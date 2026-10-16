import { Router, type Request } from 'express';
import { z } from 'zod';
import { MESSAGE_MAX_LENGTH } from '@telecare/shared';
import { getActor, type AuthGuards } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import { parseBody, parseQuery } from '../../platform/http/validate';
import type { ConsultationService } from './consultations.service';

const MAX_WAIT_SECONDS = 25;
const UpdatesQuery = z.strictObject({
  after: z.coerce.number().int().min(0).optional(),
  wait: z.coerce.number().int().min(0).max(MAX_WAIT_SECONDS).optional(),
});
const MessageBody = z.strictObject({
  clientMsgId: z.uuid('Send a UUID per message'),
  body: z.string().trim().min(1, 'Type a message').max(MESSAGE_MAX_LENGTH),
});

export function consultationRoutes(service: ConsultationService, guards: AuthGuards): Router {
  const router = Router();
  const parties = [guards.requireAuth, guards.requireRole('PATIENT', 'DOCTOR')];
  const uuid = (raw: unknown) => {
    const id = z.uuid().safeParse(raw);
    if (!id.success) throw new AppError(404, 'NOT_FOUND', 'Not found');
    return id.data;
  };
  const id = (req: Request) => uuid(req.params.id);

  router.post('/v1/appointments/:id/join', ...parties, async (req, res) => {
    res.json(await service.join(getActor(res), id(req), req.ip));
  });

  /** Long poll: returns at once if there is news, otherwise waits up to `wait` seconds. */
  router.get('/v1/consultations/:id/updates', ...parties, async (req, res) => {
    const { after = 0, wait = 0 } = parseQuery(UpdatesQuery, req);
    const gone = new AbortController();
    res.on('close', () => gone.abort()); // the app went away: stop waiting
    res.json(await service.updates(getActor(res), id(req), after, wait * 1000, gone.signal));
  });

  router.post('/v1/consultations/:id/messages', ...parties, async (req, res) => {
    const body = parseBody(MessageBody, req);
    const { message, created } = await service.send(getActor(res), id(req), body);
    res.status(created ? 201 : 200).json(message);
  });

  router.post('/v1/consultations/:id/start', ...parties, async (req, res) => {
    res.json(await service.start(getActor(res), id(req), req.ip));
  });
  router.post('/v1/consultations/:id/end', ...parties, async (req, res) => {
    res.json(await service.end(getActor(res), id(req), req.ip));
  });
  router.post('/v1/consultations/:id/leave', ...parties, async (req, res) => {
    await service.leave(getActor(res), id(req));
    res.status(204).end();
  });
  router.post('/v1/consultations/:id/video-failed', ...parties, async (req, res) => {
    await service.videoFailed(getActor(res), id(req));
    res.status(204).end();
  });

  return router;
}
