import { Router } from 'express';
import { z } from 'zod';
import { createRateLimiter } from '../../platform/http/rate-limit';
import { parseBody } from '../../platform/http/validate';
import type { VoiceService } from './voice.service';

const SynthesizeBody = z.strictObject({
  text: z.string().trim().min(1).max(1200),
  language: z.enum(['hindi', 'hinglish', 'english', 'garhwali']),
});

export function voiceRoutes(service: VoiceService): Router {
  const router = Router();
  const perIp = createRateLimiter({ max: 30, windowMs: 60 * 60 * 1000 });

  router.post('/v1/voice/synthesize', async (req, res) => {
    perIp.hit(req.ip ?? 'unknown');
    const { text, language } = parseBody(SynthesizeBody, req);
    const result = await service.synthesize(text, language);
    res.json(result);
  });

  return router;
}
