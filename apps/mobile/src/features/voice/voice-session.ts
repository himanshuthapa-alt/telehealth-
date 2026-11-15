import { useCallback, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import type {
  DoctorCard,
  Specialization,
  SpeechLanguage,
  Urgency,
  VoiceNextStep,
  VoiceSessionResponse,
} from '@telecare/shared';
import { api, session } from '@/lib/api';

/** A doctor in the urgent on-call list (a subset of the directory card). */
export interface OnCallDoctor {
  id: string;
  name: string;
  specializations: Specialization[];
  languages: string[];
  ratingAvg: number | null;
}

/** POST /v1/voice/turn response: the triage result plus routing and audio. */
export interface TurnResponse {
  turnId: string;
  transcript: string;
  language: SpeechLanguage;
  urgency: Urgency;
  specialization: Specialization | null;
  tags: string[];
  replyText: string;
  emergencyReason: string | null;
  nextStep: VoiceNextStep;
  summaryForDoctor: string | null;
  audioBase64: string | null;
  audioMime: string | null;
  ttsProvider: string;
  /** Routine lane. */
  doctors?: DoctorCard[];
  match?: { relaxation: string; specialization: Specialization; language: string | null };
  /** Urgent lane. */
  onCallDoctors?: OnCallDoctor[];
  dispatch?: { attemptId: string; channel: 'CALL' | 'APP' } | null;
}

const VOICE_HEADERS = { 'Content-Type': 'application/octet-stream' } as const;

/**
 * The data layer for a voice conversation: start a session once, then submit
 * each turn. A turn is either an audio clip (real STT) or a transcript (the
 * server's fake STT / typed input), so the flow runs with or without a key.
 */
export function useVoiceSession() {
  const sessionId = useRef<string | null>(null);

  const ensureSession = useCallback(async (languagePrior?: SpeechLanguage) => {
    if (sessionId.current) return sessionId.current;
    const res = await api.post<VoiceSessionResponse>('/v1/voice/sessions', {
      ...(languagePrior ? { languagePrior } : {}),
    });
    sessionId.current = res.sessionId;
    return res.sessionId;
  }, []);

  /** Submit a typed/example transcript (server STT = fake). Handles auth refresh. */
  const submitTranscript = useCallback(
    async (transcript: string): Promise<TurnResponse> => {
      const sid = await ensureSession();
      return api.post<TurnResponse>('/v1/voice/turn', undefined, {
        ...VOICE_HEADERS,
        'x-session-id': sid,
        'x-client-turn-id': Crypto.randomUUID(),
        'x-demo-transcript': transcript,
      });
    },
    [ensureSession],
  );

  /** Submit a recorded clip (real STT, e.g. Groq Whisper). Raw bytes, not JSON. */
  const submitAudio = useCallback(
    async (uri: string, contentType = 'audio/m4a'): Promise<TurnResponse> => {
      const sid = await ensureSession();
      const bytes = await (await fetch(uri)).blob();
      const res = await fetch(`${api.baseUrl}/v1/voice/turn`, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'x-session-id': sid,
          'x-client-turn-id': Crypto.randomUUID(),
          ...(session.accessToken() ? { Authorization: `Bearer ${session.accessToken()}` } : {}),
        },
        body: bytes,
      });
      if (!res.ok) throw new Error(`voice turn ${res.status}`);
      return (await res.json()) as TurnResponse;
    },
    [ensureSession],
  );

  const reset = useCallback(() => {
    sessionId.current = null;
  }, []);

  return { submitTranscript, submitAudio, reset };
}
