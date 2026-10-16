import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import type {
  ChatMessage,
  Consultation,
  ConsultationUpdates,
  JoinResponse,
  VideoAccess,
} from '@telecare/shared';
import { api } from '@/lib/api';
import { mergeMessages, unconfirmed, type OutboxItem } from './merge';

const WAIT_SECONDS = 25;

export type RoomState =
  | { phase: 'joining' }
  | { phase: 'error'; error: unknown }
  | { phase: 'in'; consultation: Consultation; video: VideoAccess | null };

/**
 * Everything the consultation screen needs: joins (or rejoins), then keeps chat
 * and status live with a long-poll loop that backs off when the network drops
 * (blueprint ADR-3: works fully without WebSockets). Sending goes through an
 * outbox with one id per message, so a retry can never post it twice.
 */
export function useConsultationRoom(appointmentId: string) {
  const queryClient = useQueryClient();
  const [room, setRoom] = useState<RoomState>({ phase: 'joining' });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [connected, setConnected] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const consultationId = room.phase === 'in' ? room.consultation.id : null;
  const cursor = useRef(0);

  // Join (also used to rejoin after "Try again").
  useEffect(() => {
    let current = true;
    api
      .post<JoinResponse>(`/v1/appointments/${encodeURIComponent(appointmentId)}/join`)
      .then((joined) => {
        if (!current) return;
        cursor.current = joined.cursor;
        setRoom({ phase: 'in', consultation: joined.consultation, video: joined.video });
      })
      .catch((error: unknown) => current && setRoom({ phase: 'error', error }));
    return () => {
      current = false;
    };
  }, [appointmentId, attempt]);

  // Long-poll loop while in the room.
  useEffect(() => {
    if (!consultationId) return;
    const stop = new AbortController();
    void (async () => {
      let backoff = 1000;
      while (!stop.signal.aborted) {
        try {
          const update = await api.get<ConsultationUpdates>(
            `/v1/consultations/${consultationId}/updates?after=${cursor.current}&wait=${WAIT_SECONDS}`,
            { timeoutMs: (WAIT_SECONDS + 10) * 1000, signal: stop.signal },
          );
          cursor.current = update.cursor;
          setMessages((m) => mergeMessages(m, update.messages));
          setRoom((r) => (r.phase === 'in' ? { ...r, consultation: update.consultation } : r));
          setConnected(true);
          backoff = 1000;
          if (update.consultation.status === 'COMPLETED' || update.consultation.status === 'EXPIRED') {
            void queryClient.invalidateQueries({ queryKey: ['appointments'] });
            return; // nothing more will happen in this room
          }
        } catch {
          if (stop.signal.aborted) return;
          setConnected(false);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          backoff = Math.min(backoff * 2, 15_000);
        }
      }
    })();
    return () => {
      stop.abort();
      // Leaving the screen is a "left" event, not the end of the consultation (blueprint §13.1).
      api.post(`/v1/consultations/${consultationId}/leave`).catch(() => undefined);
    };
  }, [consultationId, queryClient]);

  const post = useCallback(
    async (item: OutboxItem) => {
      if (!consultationId) return;
      setOutbox((o) => [
        ...o.filter((x) => x.clientMsgId !== item.clientMsgId),
        { ...item, state: 'sending' },
      ]);
      try {
        const saved = await api.post<ChatMessage>(`/v1/consultations/${consultationId}/messages`, {
          clientMsgId: item.clientMsgId,
          body: item.body,
        });
        setMessages((m) => mergeMessages(m, [saved]));
      } catch {
        setOutbox((o) => o.map((x) => (x.clientMsgId === item.clientMsgId ? { ...x, state: 'failed' } : x)));
      }
    },
    [consultationId],
  );

  const action = useCallback(
    async (what: 'start' | 'end') => {
      if (!consultationId) return;
      const consultation = await api.post<Consultation>(`/v1/consultations/${consultationId}/${what}`);
      setRoom((r) => (r.phase === 'in' ? { ...r, consultation } : r));
      if (what === 'end') void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    [consultationId, queryClient],
  );

  return {
    room,
    connected,
    messages,
    outbox: unconfirmed(outbox, messages),
    rejoin: () => {
      setRoom({ phase: 'joining' });
      setAttempt((n) => n + 1);
    },
    send: (body: string) => void post({ clientMsgId: Crypto.randomUUID(), body, state: 'sending' }),
    retry: (item: OutboxItem) => void post(item),
    start: () => action('start'),
    end: () => action('end'),
    reportVideoFailed: () =>
      consultationId && api.post(`/v1/consultations/${consultationId}/video-failed`).catch(() => undefined),
  };
}
