import { Router } from 'express';
import { z } from 'zod';
import { parseBody } from '../../platform/http/validate';
import type { TriageService } from './triage.service';

const TriageBody = z.strictObject({
  symptoms: z.string().trim().min(2, 'Please describe your symptoms').max(1000),
  language: z.string().trim().max(20).optional(),
});

export function triageRoutes(service: TriageService): Router {
  const router = Router();

  /**
   * POST /v1/triage
   * Classifies symptoms into doctor specialty and urgency level.
   * Publicly accessible so patients can get urgent/emergency guidance
   * immediately without auth barriers.
   */
  router.post('/v1/triage', async (req, res) => {
    const { symptoms, language } = parseBody(TriageBody, req);
    const result = await service.triage({ symptoms, language });
    res.json(result);
  });

  return router;
}
