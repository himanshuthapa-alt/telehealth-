import {
  joinWindow,
  type Appointment,
  type ChatMessage,
  type Consultation,
  type ConsultationUpdates,
  type JoinResponse,
} from '@telecare/shared';
import type { Actor } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import type { AppointmentRepository } from '../appointments/appointments.repository';
import type { AuditLog } from '../audit/audit';
import type { ConsultationRepository, ConsultationRow } from './consultations.repository';
import type { Notifier } from './notifier';
import type { VideoProvider } from './video';

/** Someone counts as "in the room" if their app checked in this recently (long-polls do, every ≤25 s). */
const PRESENT_FOR_MS = 35_000;
const TOKEN_TTL_SECONDS = 60 * 60;

export interface ConsultationServiceDeps {
  repo: ConsultationRepository;
  appointments: AppointmentRepository;
  /** null = chat-only (VIDEO_PROVIDER=none). */
  video: VideoProvider | null;
  notifier: Notifier;
  audit: AuditLog;
  now: () => Date;
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Consultation not found');
const closed = () => new AppError(409, 'CONSULTATION_CLOSED', 'This consultation has ended');

export function createConsultationService({
  repo,
  appointments,
  video,
  notifier,
  audit,
  now,
}: ConsultationServiceDeps) {
  // ponytail: presence lives in memory (one API instance); move to the DB or Redis when scaling out
  const lastSeen = new Map<string, Map<string, number>>();
  const seen = (consultationId: string, userId: string) => {
    if (!lastSeen.has(consultationId)) lastSeen.set(consultationId, new Map());
    lastSeen.get(consultationId)!.set(userId, now().getTime());
  };
  const isPresent = (consultationId: string, userId: string) =>
    now().getTime() - (lastSeen.get(consultationId)?.get(userId) ?? 0) < PRESENT_FOR_MS;

  const view = (c: ConsultationRow, a: Appointment): Consultation => ({
    id: c.id,
    appointmentId: c.appointmentId,
    status: c.status,
    startedAt: c.startedAt?.toISOString() ?? null,
    endedAt: c.endedAt?.toISOString() ?? null,
    present: { patient: isPresent(c.id, a.patient.id), doctor: isPresent(c.id, a.doctor.id) },
  });

  /** The consultation and its appointment, if `actor` is its patient or doctor. Others get 404. */
  async function load(actor: Actor, consultationId: string) {
    const c = await repo.get(consultationId);
    const a = c && (await appointments.getFor(c.appointmentId, actor));
    if (!c || !a) throw notFound();
    return { c, a };
  }

  async function systemMessage(consultationId: string, body: string) {
    await repo.addMessage({ consultationId, senderId: null, clientMsgId: null, type: 'SYSTEM', body });
  }

  return {
    /**
     * Enter the waiting room / consultation (blueprint §13.2): checks who (patient
     * or doctor of this appointment), when (inside the window) and state, logs the
     * join, and hands out a short-lived video token. The same call rejoins.
     */
    async join(actor: Actor, appointmentId: string, ip?: string): Promise<JoinResponse> {
      const a = await appointments.getFor(appointmentId, actor);
      if (!a) {
        await audit.record({
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CONSULTATION_JOIN_DENIED',
          entityType: 'appointment',
          entityId: appointmentId,
          ip,
        });
        throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
      }
      const { opensAt, closesAt } = joinWindow(a);
      if (a.status !== 'BOOKED' || now() >= closesAt) throw closed();
      if (now() < opensAt)
        throw new AppError(409, 'JOIN_NOT_OPEN', 'The consultation room is not open yet', {
          opensAt: opensAt.toISOString(),
        });

      let c = await repo.findByAppointment(appointmentId);
      if (!c) {
        const room = video ? await video.createRoom(appointmentId) : null;
        c = await repo.createOrGet({
          appointmentId,
          provider: video?.name ?? 'none',
          providerRoomId: room?.roomId ?? null,
        });
      }
      if (c.status === 'COMPLETED' || c.status === 'EXPIRED') throw closed();

      await repo.addEvent(c.id, actor.id, (await repo.hasJoined(c.id, actor.id)) ? 'RECONNECTED' : 'JOINED');
      await audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'CONSULTATION_JOINED',
        entityType: 'consultation',
        entityId: c.id,
        ip,
      });
      seen(c.id, actor.id);
      notifier.notify(c.id);

      const token =
        video && c.providerRoomId
          ? await video.issueJoinToken(c.providerRoomId, actor.id, actor.role, TOKEN_TTL_SECONDS)
          : null;
      return {
        consultation: view(c, a),
        video: token && {
          provider: c.provider,
          roomId: c.providerRoomId!,
          token: token.token,
          expiresAt: token.expiresAt.toISOString(),
        },
        cursor: 0,
      };
    },

    /**
     * New messages and the current status. If nothing is new, waits up to `waitMs`
     * for something to happen (long poll), so chat arrives without WebSockets.
     */
    async updates(
      actor: Actor,
      consultationId: string,
      after: number,
      waitMs: number,
      signal?: AbortSignal,
    ): Promise<ConsultationUpdates> {
      const { a } = await load(actor, consultationId);
      seen(consultationId, actor.id);
      let found = await repo.messagesAfter(consultationId, after, 200);
      if (found.length === 0 && waitMs > 0) {
        await notifier.wait(consultationId, waitMs, signal);
        found = await repo.messagesAfter(consultationId, after, 200);
      }
      const c = (await repo.get(consultationId))!;
      return { consultation: view(c, a), messages: found, cursor: found.at(-1)?.id ?? after };
    },

    async send(
      actor: Actor,
      consultationId: string,
      input: { clientMsgId: string; body: string },
    ): Promise<{ message: ChatMessage; created: boolean }> {
      const { c } = await load(actor, consultationId);
      if (c.status !== 'WAITING' && c.status !== 'ACTIVE') throw closed();
      const result = await repo.addMessage({
        consultationId,
        senderId: actor.id,
        clientMsgId: input.clientMsgId,
        type: 'TEXT',
        body: input.body,
      });
      seen(consultationId, actor.id);
      if (result.created) notifier.notify(consultationId);
      return result;
    },

    /** Doctor: WAITING → ACTIVE. */
    async start(actor: Actor, consultationId: string, ip?: string) {
      const { c, a } = await load(actor, consultationId);
      if (actor.role !== 'DOCTOR')
        throw new AppError(403, 'FORBIDDEN', 'Only the doctor can start the consultation');
      const started = await repo.transition(c.id, ['WAITING'], 'ACTIVE', now());
      if (!started) throw new AppError(409, 'INVALID_STATE', 'The consultation is not waiting to start');
      await systemMessage(c.id, 'The doctor started the consultation.');
      await audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'CONSULTATION_STARTED',
        entityType: 'consultation',
        entityId: c.id,
        ip,
      });
      notifier.notify(c.id);
      return view(started, a);
    },

    /** Doctor: ACTIVE → COMPLETED. The appointment becomes COMPLETED and the video room is closed. */
    async end(actor: Actor, consultationId: string, ip?: string) {
      const { c, a } = await load(actor, consultationId);
      if (actor.role !== 'DOCTOR')
        throw new AppError(403, 'FORBIDDEN', 'Only the doctor can end the consultation');
      const ended = await repo.transition(c.id, ['ACTIVE'], 'COMPLETED', now());
      if (!ended) throw new AppError(409, 'INVALID_STATE', 'The consultation is not in progress');
      await appointments.finish(c.appointmentId, 'COMPLETED');
      if (video && c.providerRoomId) await video.endRoom(c.providerRoomId);
      await systemMessage(c.id, 'The consultation has ended.');
      await audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'CONSULTATION_ENDED',
        entityType: 'consultation',
        entityId: c.id,
        ip,
      });
      notifier.notify(c.id);
      return view(ended, a);
    },

    /** Leaving is an event, not the end (blueprint §13.1): the patient can rejoin. */
    async leave(actor: Actor, consultationId: string) {
      const { c } = await load(actor, consultationId);
      await repo.addEvent(c.id, actor.id, 'LEFT');
      lastSeen.get(c.id)?.delete(actor.id);
      notifier.notify(c.id);
    },

    /** The consultation and appointment if `actor` takes part; used by prescriptions. Others get 404. */
    participant: load,

    /** Posts a system or prescription-card message into the chat and wakes open rooms. */
    async post(consultationId: string, type: 'SYSTEM' | 'PRESCRIPTION_CARD', body: string) {
      await repo.addMessage({ consultationId, senderId: null, clientMsgId: null, type, body });
      notifier.notify(consultationId);
    },

    async videoFailed(actor: Actor, consultationId: string) {
      const { c } = await load(actor, consultationId);
      await repo.addEvent(c.id, actor.id, 'VIDEO_FAILED');
    },

    /**
     * Closes consultations whose window has passed (run every minute):
     * in progress → COMPLETED; never started → EXPIRED and the appointment NO_SHOW;
     * nobody joined at all → appointment NO_SHOW.
     */
    async sweep(): Promise<number> {
      let changed = 0;
      for (const c of await repo.dueToClose(now())) {
        if (c.status === 'ACTIVE' && (await repo.transition(c.id, ['ACTIVE'], 'COMPLETED', now()))) {
          await appointments.finish(c.appointmentId, 'COMPLETED');
        } else if (await repo.transition(c.id, ['WAITING'], 'EXPIRED', now())) {
          await appointments.finish(c.appointmentId, 'NO_SHOW');
        }
        if (video && c.providerRoomId) await video.endRoom(c.providerRoomId);
        notifier.notify(c.id);
        changed += 1;
      }
      for (const appointmentId of await repo.unjoinedClosedAppointments(now())) {
        await appointments.finish(appointmentId, 'NO_SHOW');
        changed += 1;
      }
      return changed;
    },
  };
}

export type ConsultationService = ReturnType<typeof createConsultationService>;
