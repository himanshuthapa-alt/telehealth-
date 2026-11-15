import express, { Router } from 'express';
import { z } from 'zod';
import { SPEECH_LANGUAGES, type SpeechLanguage } from '@telecare/shared';
import type { AuthGuards } from '../../platform/http/auth';
import { getActor } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import { parseBody } from '../../platform/http/validate';
import type { MatchingService } from '../matching/matching.service';
import type { DispatchService } from '../dispatch/dispatch.service';
import type { TurnOutcome, VoiceService } from './voice.service';

const StartBody = z.strictObject({
  languagePrior: z.enum(SPEECH_LANGUAGES).optional(),
});

const MAX_AUDIO_BYTES = 12 * 1024 * 1024; // under Groq's 25 MB free cap (project map §8.2)

export interface VoiceRouteDeps {
  voice: VoiceService;
  matching: MatchingService;
  dispatch: DispatchService;
}

/**
 * Voice-first endpoints (project map §8.3). The patient speaks; the API
 * transcribes, triages (red-flags FIRST), and routes to a real doctor. It never
 * diagnoses or prescribes.
 */
export function voiceRoutes(deps: VoiceRouteDeps, guards: AuthGuards): Router {
  const router = Router();
  const patient = [guards.requireAuth, guards.requireRole('PATIENT')];

  router.post('/v1/voice/sessions', ...patient, async (req, res) => {
    const body = parseBody(StartBody, req);
    const actor = getActor(res);
    res.status(201).json(
      await deps.voice.startSession({
        patientId: actor.id,
        channel: 'APP',
        languagePrior: body.languagePrior ?? null,
      }),
    );
  });

  // One voice turn. Audio is raw bytes (any audio/* or octet-stream); metadata in
  // headers. Fake STT reads x-demo-transcript, so the flow runs with no audio.
  router.post(
    '/v1/voice/turn',
    express.raw({ type: () => true, limit: MAX_AUDIO_BYTES }),
    ...patient,
    async (req, res) => {
      const sessionId = req.get('x-session-id');
      const clientTurnId = req.get('x-client-turn-id');
      if (!sessionId || !clientTurnId)
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'x-session-id and x-client-turn-id headers are required',
        );

      const actor = getActor(res);
      const owner = await deps.voice.sessionOwner(sessionId);
      if (!owner) throw new AppError(404, 'NOT_FOUND', 'Session not found');
      if (owner.patientId && owner.patientId !== actor.id)
        throw new AppError(403, 'FORBIDDEN', 'This session belongs to another patient');

      const demoTranscript = req.get('x-demo-transcript') ?? undefined;
      const audio = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (audio.length === 0 && !demoTranscript)
        throw new AppError(400, 'VALIDATION_FAILED', 'Send audio bytes or an x-demo-transcript header');

      const priorHeader = req.get('x-language-prior');
      const prior = isSpeechLanguage(priorHeader) ? priorHeader : null;

      const outcome = await deps.voice.handleTurn({
        sessionId,
        clientTurnId,
        audio,
        contentType: req.get('content-type') ?? 'application/octet-stream',
        demoTranscript,
        profilePrior: prior,
      });

      const extra = await routeToDoctors(deps, outcome);
      const { audio: tts, result } = outcome;

      res.json({
        ...result,
        audioBase64: tts.audio ? tts.audio.toString('base64') : null,
        audioMime: tts.mime,
        ttsProvider: tts.provider,
        ...extra,
      });
    },
  );

  return router;
}

function isSpeechLanguage(v: string | undefined): v is SpeechLanguage {
  return !!v && (SPEECH_LANGUAGES as readonly string[]).includes(v);
}

/** ROUTINE -> list bookable doctors; URGENT -> page an on-call doctor. */
async function routeToDoctors(deps: VoiceRouteDeps, outcome: TurnOutcome) {
  const { result, triageResultId } = outcome;
  if (result.urgency === 'EMERGENCY' || !result.specialization) return {};

  if (result.urgency === 'URGENT') {
    const match = await deps.matching.findOnCall({
      specialization: result.specialization,
      language: result.language,
    });
    const first = match.doctors[0];
    let dispatch: { attemptId: string; channel: 'CALL' | 'APP' } | null = null;
    if (first && triageResultId) {
      dispatch = await deps.dispatch.page({
        triageResultId,
        doctorId: first.id,
        doctorName: first.name,
        specialization: match.specialization,
        summary: result.summaryForDoctor ?? 'Urgent symptom reported',
        attemptNo: 1,
      });
    }
    return { onCallDoctors: match.doctors, dispatch, specialization: match.specialization };
  }

  const match = await deps.matching.findRoutine({
    specialization: result.specialization,
    language: result.language,
  });
  return {
    doctors: match.doctors,
    match: { relaxation: match.relaxation, specialization: match.specialization, language: match.language },
  };
}
