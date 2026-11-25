import { Router } from 'express';
import { z } from 'zod';
import { parseQuery } from '../../platform/http/validate';

const SpeechQuery = z.strictObject({
  text: z.string().trim().min(1, 'Nothing to speak').max(1000),
});

/**
 * Text-to-speech voice output, backed by the Chatterbox TTS service.
 * GET so the mobile player can stream it straight from a URL.
 * Public (no auth) so the welcome/guidance voice works before sign-in.
 */
export function speechRoutes(ttsBaseUrl: string): Router {
  const router = Router();

  router.get('/v1/speech', async (req, res) => {
    const { text } = parseQuery(SpeechQuery, req);

    let upstream: Response;
    try {
      upstream = await fetch(`${ttsBaseUrl.replace(/\/+$/, '')}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text }),
      });
    } catch {
      // Chatterbox not running / unreachable.
      res.status(503).json({ error: { code: 'TTS_UNAVAILABLE', message: 'Voice service is offline.' } });
      return;
    }

    if (!upstream.ok || !upstream.body) {
      res
        .status(502)
        .json({ error: { code: 'TTS_FAILED', message: `Voice service returned ${upstream.status}.` } });
      return;
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  });

  return router;
}
