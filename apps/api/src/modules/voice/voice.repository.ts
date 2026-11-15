import { and, desc, eq } from 'drizzle-orm';
import type { SpeechLanguage, Specialization, Urgency, VoiceChannel, VoiceOutcome } from '@telecare/shared';
import type { Database } from '../../platform/db/client';
import { triageResultTags, triageResults } from '../triage/triage.schema';
import { voiceSessions, voiceTurns } from './voice.schema';

export interface StoredTurn {
  turnId: string;
  triageResultId: string | null;
  transcript: string;
  detectedLanguage: SpeechLanguage;
  urgency: Urgency;
  specialization: Specialization | null;
  tags: string[];
  summaryForDoctor: string | null;
  emergencyReason: string | null;
}

export interface RecordTurnInput {
  sessionId: string;
  clientTurnId: string;
  transcript: string;
  sttProvider: string;
  sttLanguage?: string | null;
  detectedLanguage: SpeechLanguage;
  languageConfidence: number;
  ttsProvider: string;
  latencyMs: Record<string, number>;
  audioRef: string | null;
  triage: {
    urgency: Urgency;
    specialization: Specialization | null;
    tags: string[];
    summaryForDoctor: string | null;
    emergencyReason: string | null;
    ruleHits: string[];
    model: string;
    promptVersion: string;
  };
}

export interface VoiceRepository {
  createSession(input: {
    patientId: string | null;
    channel: VoiceChannel;
    languagePrior: SpeechLanguage | null;
  }): Promise<string>;
  sessionOwner(sessionId: string): Promise<{ patientId: string | null } | null>;
  findTurn(sessionId: string, clientTurnId: string): Promise<StoredTurn | null>;
  recordTurn(input: RecordTurnInput): Promise<{ turnId: string; triageResultId: string }>;
  setOutcome(sessionId: string, outcome: VoiceOutcome): Promise<void>;
}

export function createVoiceRepository(db: Database): VoiceRepository {
  async function storedTurn(turnId: string): Promise<StoredTurn | null> {
    const [turn] = await db.select().from(voiceTurns).where(eq(voiceTurns.id, turnId));
    if (!turn) return null;
    const [tr] = await db
      .select()
      .from(triageResults)
      .where(eq(triageResults.turnId, turnId))
      .orderBy(desc(triageResults.createdAt));
    const tags = tr
      ? (await db.select().from(triageResultTags).where(eq(triageResultTags.triageResultId, tr.id))).map(
          (t) => t.tagCode,
        )
      : [];
    return {
      turnId,
      triageResultId: tr?.id ?? null,
      transcript: turn.transcript,
      detectedLanguage: (turn.detectedLanguage ?? 'hi') as SpeechLanguage,
      urgency: (tr?.urgency ?? 'ROUTINE') as Urgency,
      specialization: (tr?.specialization ?? null) as Specialization | null,
      tags,
      summaryForDoctor: tr?.summaryForDoctor ?? null,
      emergencyReason: tr?.emergencyReason ?? null,
    };
  }

  return {
    async createSession({ patientId, channel, languagePrior }) {
      const [row] = await db
        .insert(voiceSessions)
        .values({ patientId, channel, languagePrior })
        .returning({ id: voiceSessions.id });
      return row!.id;
    },

    async sessionOwner(sessionId) {
      const [row] = await db
        .select({ patientId: voiceSessions.patientId })
        .from(voiceSessions)
        .where(eq(voiceSessions.id, sessionId));
      return row ?? null;
    },

    async findTurn(sessionId, clientTurnId) {
      const [turn] = await db
        .select({ id: voiceTurns.id })
        .from(voiceTurns)
        .where(and(eq(voiceTurns.sessionId, sessionId), eq(voiceTurns.clientTurnId, clientTurnId)));
      return turn ? storedTurn(turn.id) : null;
    },

    recordTurn(input) {
      return db.transaction(async (tx) => {
        const [turn] = await tx
          .insert(voiceTurns)
          .values({
            sessionId: input.sessionId,
            clientTurnId: input.clientTurnId,
            transcript: input.transcript,
            sttProvider: input.sttProvider,
            sttLanguage: input.sttLanguage ?? null,
            detectedLanguage: input.detectedLanguage,
            languageConfidence: input.languageConfidence,
            ttsProvider: input.ttsProvider,
            latencyMs: input.latencyMs,
            audioRef: input.audioRef,
          })
          .returning({ id: voiceTurns.id });
        const turnId = turn!.id;
        const [tr] = await tx
          .insert(triageResults)
          .values({
            turnId,
            urgency: input.triage.urgency,
            emergencyReason: input.triage.emergencyReason,
            specialization: input.triage.specialization,
            summaryForDoctor: input.triage.summaryForDoctor,
            model: input.triage.model,
            promptVersion: input.triage.promptVersion,
            ruleHits: input.triage.ruleHits,
          })
          .returning({ id: triageResults.id });
        if (input.triage.tags.length > 0) {
          await tx
            .insert(triageResultTags)
            .values(input.triage.tags.map((tagCode) => ({ triageResultId: tr!.id, tagCode })));
        }
        return { turnId, triageResultId: tr!.id };
      });
    },

    async setOutcome(sessionId, outcome) {
      await db
        .update(voiceSessions)
        .set({ outcome, endedAt: new Date() })
        .where(eq(voiceSessions.id, sessionId));
    },
  };
}
