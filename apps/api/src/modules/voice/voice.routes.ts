import express, { Router } from 'express';
import { z } from 'zod';
import { isVoiceIntent, parseVoiceIntent, SPOKEN_LOCALES } from '@telecare/shared';
import { getActor, type AuthGuards } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import { createRateLimiter } from '../../platform/http/rate-limit';
import { parseBody } from '../../platform/http/validate';
import type { Sarvam } from './sarvam';

const IntentRequest = z.strictObject({
  transcript: z.string().trim().min(1, 'Nothing was said').max(500),
  locale: z.enum(SPOKEN_LOCALES).optional(),
  // Which screen the user is on, so a server-side parser could use context later.
  screen: z.string().trim().max(60).optional(),
});

const intentOf = (text: string) => {
  const intent = parseVoiceIntent(text);
  // Defensive: anything outside the fixed vocabulary becomes `unknown`.
  return isVoiceIntent(intent) ? intent : ({ kind: 'unknown' } as const);
};

/**
 * Interprets a spoken phrase into a typed intent from the fixed vocabulary.
 * It only interprets — it never books, orders or cancels; the app performs
 * actions through the existing endpoints, so all auth/ownership/stock rules
 * still apply.
 *
 * `/v1/voice/intent` is public: it reads no data and maps text to an enum.
 * `/v1/voice/understand` takes recorded audio in any Indian language (Sarvam),
 * so it needs a signed-in user and is rate limited: every call spends credits.
 *
 * Privacy: transcripts and audio are never logged or stored.
 */
export function voiceRoutes(guards: AuthGuards, sarvam: Sarvam | null): Router {
  const router = Router();
  const perUser = createRateLimiter({ max: 40, windowMs: 15 * 60 * 1000 });

  router.get('/v1/voice/capabilities', (_req, res) => {
    res.json({ indianLanguages: sarvam !== null });
  });

  router.post('/v1/voice/intent', (req, res) => {
    const { transcript } = parseBody(IntentRequest, req);
    res.json({ intent: intentOf(transcript) });
  });

  router.post(
    '/v1/voice/understand',
    guards.requireAuth,
    express.raw({ type: ['audio/*', 'video/webm', 'application/octet-stream'], limit: '2mb' }),
    async (req, res) => {
      if (!sarvam) throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Indian-language voice is not set up.');
      perUser.hit(getActor(res).id);
      if (!Buffer.isBuffer(req.body) || req.body.length < 1000)
        throw new AppError(400, 'VALIDATION_FAILED', 'No audio was recorded.');
      let heard: Awaited<ReturnType<Sarvam['understand']>>;
      try {
        heard = await sarvam.understand(req.body, req.get('content-type') ?? 'audio/mp4');
      } catch {
        throw new AppError(502, 'SERVICE_UNAVAILABLE', 'Could not understand the audio. Please try again.');
      }
      res.json({
        transcript: heard.english,
        languageCode: heard.languageCode,
        intent: heard.english ? intentOf(heard.english) : { kind: 'unknown' },
      });
    },
  );

  return router;
}
