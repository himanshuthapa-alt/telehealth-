import { randomUUID } from 'node:crypto';
import type {
  SpeechLanguage,
  VoiceChannel,
  VoiceNextStep,
  VoiceSessionResponse,
  VoiceTurnResult,
} from '@telecare/shared';
import { detectLanguage } from '../language/detect';
import { buildReply, emergencyReply, type TriageService } from '../triage/triage.service';
import type { SpeechToText } from './stt';
import type { TextToSpeech, TtsResult } from './tts';
import type { StoredTurn, VoiceRepository } from './voice.repository';

export interface HandleTurnInput {
  sessionId: string;
  clientTurnId: string;
  audio: Buffer;
  contentType: string;
  /** For STT_PROVIDER=fake / typed demo input. */
  demoTranscript?: string;
  /** patient_profiles.preferred_language as a speech code, used as a detection prior. */
  profilePrior?: SpeechLanguage | null;
}

export interface VoiceServiceDeps {
  stt: SpeechToText;
  tts: TextToSpeech;
  triage: TriageService;
  repo: VoiceRepository;
  /** VOICE_AUDIO_RETENTION_HOURS. 0 = never store audio. */
  retentionHours: number;
  promptVersion: string;
  now?: () => Date;
  logger?: { warn: (msg: string, meta?: Record<string, unknown>) => void };
}

function nextStepFor(result: { urgency: string; needsClarification: boolean }): VoiceNextStep {
  if (result.urgency === 'EMERGENCY') return 'EMERGENCY';
  if (result.needsClarification) return 'CLARIFY';
  if (result.urgency === 'URGENT') return 'URGENT_WAIT';
  return 'CONFIRM_SPECIALTY';
}

export interface TurnOutcome {
  result: VoiceTurnResult;
  audio: TtsResult;
  /** triage_results.id for the urgent-paging lane (null on EMERGENCY/clarify). */
  triageResultId: string | null;
}

/** Rebuild a result from a stored turn (idempotent retry: no re-billing STT/LLM). */
function resultFromStored(stored: StoredTurn): VoiceTurnResult {
  const replyText =
    stored.urgency === 'EMERGENCY'
      ? emergencyReply(stored.detectedLanguage)
      : buildReply(
          stored.detectedLanguage,
          stored.specialization ?? 'General Physician',
          stored.tags,
          stored.urgency,
        );
  return {
    turnId: stored.turnId,
    transcript: stored.transcript,
    language: stored.detectedLanguage,
    urgency: stored.urgency,
    specialization: stored.specialization,
    tags: stored.tags,
    replyText,
    emergencyReason: stored.emergencyReason,
    nextStep: nextStepFor({ urgency: stored.urgency, needsClarification: false }),
    summaryForDoctor: stored.summaryForDoctor,
  };
}

export function createVoiceService(deps: VoiceServiceDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    async startSession(input: {
      patientId: string | null;
      channel: VoiceChannel;
      languagePrior: SpeechLanguage | null;
    }): Promise<VoiceSessionResponse> {
      const sessionId = await deps.repo.createSession(input);
      return { sessionId, languagePrior: input.languagePrior, promptManifestVersion: 1 };
    },

    /** The patient who owns a session, for route authorization. */
    sessionOwner(sessionId: string) {
      return deps.repo.sessionOwner(sessionId);
    },

    /** One voice turn: STT -> detect language -> triage -> TTS -> persist. */
    async handleTurn(input: HandleTurnInput): Promise<TurnOutcome> {
      // Idempotency: a retried/queued turn returns the stored result.
      const existing = await deps.repo.findTurn(input.sessionId, input.clientTurnId);
      if (existing) {
        const result = resultFromStored(existing);
        return {
          result,
          audio: await deps.tts.synthesize(result.replyText, result.language),
          triageResultId: existing.triageResultId,
        };
      }

      const latency: Record<string, number> = {};

      // 1. Speech to text.
      let t = Date.now();
      const stt = await deps.stt.transcribe(input.audio, {
        contentType: input.contentType,
        demoTranscript: input.demoTranscript,
      });
      latency.stt = Date.now() - t;

      // 2. Language detection.
      const detected = detectLanguage({
        sttLanguage: stt.language,
        transcript: stt.text,
        profilePrior: input.profilePrior ?? null,
      });

      // 3. Triage (red-flags first, then LLM, then fallback — inside the service).
      t = Date.now();
      const decision = await deps.triage.triage({ transcript: stt.text, language: detected.language });
      latency.triage = Date.now() - t;

      // 4. Text to speech.
      t = Date.now();
      const audio = await deps.tts.synthesize(decision.replyText, detected.language);
      latency.tts = Date.now() - t;

      // 5. Persist (transcript + triage; raw audio only if retention is on).
      const audioRef = deps.retentionHours > 0 ? `audio-${randomUUID()}` : null;
      const { turnId, triageResultId } = await deps.repo.recordTurn({
        sessionId: input.sessionId,
        clientTurnId: input.clientTurnId,
        transcript: stt.text,
        sttProvider: deps.stt.name,
        sttLanguage: stt.language,
        detectedLanguage: detected.language,
        languageConfidence: detected.confidence,
        ttsProvider: audio.provider,
        latencyMs: latency,
        audioRef,
        triage: {
          urgency: decision.urgency,
          specialization: decision.specialization,
          tags: decision.tags,
          summaryForDoctor: decision.summaryForDoctor,
          emergencyReason: decision.emergencyReason,
          ruleHits: decision.ruleHits,
          model: decision.engine,
          promptVersion: deps.promptVersion,
        },
      });

      if (decision.urgency === 'EMERGENCY') {
        await deps.repo.setOutcome(input.sessionId, 'EMERGENCY_ADVISED');
      }

      const result: VoiceTurnResult = {
        turnId,
        transcript: stt.text,
        language: detected.language,
        urgency: decision.urgency,
        specialization: decision.specialization,
        tags: decision.tags,
        replyText: decision.replyText,
        emergencyReason: decision.emergencyReason,
        nextStep: nextStepFor(decision),
        summaryForDoctor: decision.summaryForDoctor,
      };
      void now; // reserved for session timing
      return { result, audio, triageResultId };
    },
  };
}

export type VoiceService = ReturnType<typeof createVoiceService>;
