import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { createRateLimiter } from '../../platform/http/rate-limit';
import { AppError } from '../../platform/http/errors';
import { parseBody } from '../../platform/http/validate';
import type { TriageService } from './triage.service';

const TriageBody = z.strictObject({
  symptoms: z.string().trim().min(2, 'Please describe your symptoms').max(1000),
  language: z.string().trim().max(20).optional(),
});

export function triageRoutes(service: TriageService): Router {
  const router = Router();
  const triageLimit = createRateLimiter({ max: 30, windowMs: 15 * 60 * 1000 });
  const audioLimit = createRateLimiter({ max: 20, windowMs: 15 * 60 * 1000 });
  const parseAudio = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
  }).single('audio');

  /**
   * POST /v1/triage
   * Classifies symptoms into doctor specialty and urgency level.
   * Publicly accessible so patients can get urgent/emergency guidance
   * immediately without auth barriers.
   */
  router.post('/v1/triage', async (req, res) => {
    triageLimit.hit(req.ip ?? 'unknown');
    const { symptoms, language } = parseBody(TriageBody, req);
    const result = await service.triage({ symptoms, language });
    res.json(result);
  });

  /**
   * Transcribes one short microphone clip. The upload stays in memory and is
   * forwarded to Groq; TeleCare does not write the recording to disk.
   */
  router.post(
    '/v1/triage/transcribe',
    (req, res, next) => {
      audioLimit.hit(req.ip ?? 'unknown');
      parseAudio(req, res, (error) => {
        if (!error) return next();
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError(413, 'BAD_REQUEST', 'Audio clips must be 10 MB or smaller.'));
        }
        return next(new AppError(400, 'BAD_REQUEST', 'Upload a supported audio clip.'));
      });
    },
    async (req, res) => {
      const file = req.file;
      if (!file) throw new AppError(400, 'BAD_REQUEST', 'Choose a short audio clip to transcribe.');
      if (!file.mimetype.toLowerCase().startsWith('audio/')) {
        throw new AppError(415, 'BAD_REQUEST', 'The uploaded file is not recognized as audio.');
      }

      const extension = file.mimetype.includes('webm')
        ? 'webm'
        : file.mimetype.includes('wav')
          ? 'wav'
          : 'm4a';
      const result = await service.transcribe({
        buffer: file.buffer,
        mimeType: file.mimetype.split(';')[0] ?? 'audio/mp4',
        filename: `bolo.${extension}`,
      });
      res.json(result);
    },
  );

  return router;
}
