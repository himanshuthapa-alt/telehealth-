import { Router } from 'express';
import { z } from 'zod';
import { isVoiceIntent, parseVoiceIntent, SPOKEN_LOCALES } from '@telecare/shared';
import { parseBody } from '../../platform/http/validate';

const IntentRequest = z.strictObject({
  transcript: z.string().trim().min(1, 'Nothing was said').max(500),
  locale: z.enum(SPOKEN_LOCALES).optional(),
  // Which screen the user is on, so a server-side parser could use context later.
  screen: z.string().trim().max(60).optional(),
});

/**
 * Interprets a spoken phrase into a typed intent from the fixed vocabulary.
 * It only interprets — it never books, orders or cancels; the app performs
 * actions through the existing endpoints, so all auth/ownership/stock rules
 * still apply.
 *
 * Public (no auth): it reads no data and maps text to an enum. The app parses
 * the same `parseVoiceIntent` locally for an instant, offline answer; this
 * endpoint is the server-side seam where a cloud/LLM parser can slot in later.
 *
 * Privacy: the transcript is not logged (request bodies are never logged) and
 * no personal identifier is accepted — only the transcript, locale and screen.
 */
export function voiceRoutes(): Router {
  const router = Router();

  router.post('/v1/voice/intent', (req, res) => {
    const { transcript } = parseBody(IntentRequest, req);
    const intent = parseVoiceIntent(transcript);
    // Defensive: anything outside the fixed vocabulary becomes `unknown`.
    res.json({ intent: isVoiceIntent(intent) ? intent : { kind: 'unknown' } });
  });

  return router;
}
