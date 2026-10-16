import { and, asc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  JOIN_GRACE_MINUTES_AFTER,
  type ChatMessage,
  type ConsultationEventType,
  type ConsultationStatus,
  type MessageType,
} from '@telecare/shared';
import type { Database } from '../../platform/db/client';
import { appointments } from '../appointments/appointments.schema';
import { consultationEvents, consultations, messages } from './consultations.schema';

export type ConsultationRow = typeof consultations.$inferSelect;

/** Storage for consultations, their events and chat. Business code depends on this interface (D1). */
export interface ConsultationRepository {
  findByAppointment(appointmentId: string): Promise<ConsultationRow | null>;
  get(id: string): Promise<ConsultationRow | null>;
  /** Creates it, or returns the one another request created a moment earlier. */
  createOrGet(c: {
    appointmentId: string;
    provider: string;
    providerRoomId: string | null;
  }): Promise<ConsultationRow>;
  /** Moves status only if it is currently one of `from` (safe against races). */
  transition(
    id: string,
    from: ConsultationStatus[],
    to: ConsultationStatus,
    at: Date,
  ): Promise<ConsultationRow | null>;
  addEvent(consultationId: string, userId: string, type: ConsultationEventType): Promise<void>;
  hasJoined(consultationId: string, userId: string): Promise<boolean>;
  /** Adds a message; a repeat of the same (sender, clientMsgId) returns the original instead. */
  addMessage(m: {
    consultationId: string;
    senderId: string | null;
    clientMsgId: string | null;
    type: MessageType;
    body: string;
  }): Promise<{ message: ChatMessage; created: boolean }>;
  messagesAfter(consultationId: string, after: number, limit: number): Promise<ChatMessage[]>;
  /** Consultations still WAITING/ACTIVE whose join window has closed. */
  dueToClose(now: Date): Promise<ConsultationRow[]>;
  /** BOOKED appointments nobody joined, whose window has closed. */
  unjoinedClosedAppointments(now: Date): Promise<string[]>;
}

const toMessage = (m: typeof messages.$inferSelect): ChatMessage => ({
  id: m.id,
  type: m.type,
  senderId: m.senderId,
  clientMsgId: m.clientMsgId,
  body: m.body,
  createdAt: m.createdAt.toISOString(),
});

const graceClosed = (now: Date) =>
  lte(sql`${appointments.endAt} + make_interval(mins => ${JOIN_GRACE_MINUTES_AFTER})`, now);

export function createConsultationRepository(db: Database): ConsultationRepository {
  return {
    async findByAppointment(appointmentId) {
      const [row] = await db
        .select()
        .from(consultations)
        .where(eq(consultations.appointmentId, appointmentId));
      return row ?? null;
    },
    async get(id) {
      const [row] = await db.select().from(consultations).where(eq(consultations.id, id));
      return row ?? null;
    },
    async createOrGet(c) {
      const [row] = await db.insert(consultations).values(c).onConflictDoNothing().returning();
      if (row) return row;
      const [existing] = await db
        .select()
        .from(consultations)
        .where(eq(consultations.appointmentId, c.appointmentId));
      return existing!;
    },
    async transition(id, from, to, at) {
      const patch = to === 'ACTIVE' ? { status: to, startedAt: at } : { status: to, endedAt: at };
      const [row] = await db
        .update(consultations)
        .set(patch)
        .where(and(eq(consultations.id, id), inArray(consultations.status, from)))
        .returning();
      return row ?? null;
    },
    async addEvent(consultationId, userId, type) {
      await db.insert(consultationEvents).values({ consultationId, userId, type });
    },
    async hasJoined(consultationId, userId) {
      const [row] = await db
        .select({ id: consultationEvents.id })
        .from(consultationEvents)
        .where(
          and(eq(consultationEvents.consultationId, consultationId), eq(consultationEvents.userId, userId)),
        )
        .limit(1);
      return !!row;
    },
    async addMessage(m) {
      const [row] = await db.insert(messages).values(m).onConflictDoNothing().returning();
      if (row) return { message: toMessage(row), created: true };
      const [existing] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.senderId, m.senderId!), eq(messages.clientMsgId, m.clientMsgId!)));
      return { message: toMessage(existing!), created: false };
    },
    async messagesAfter(consultationId, after, limit) {
      const rows = await db
        .select()
        .from(messages)
        .where(and(eq(messages.consultationId, consultationId), gt(messages.id, after)))
        .orderBy(asc(messages.id))
        .limit(limit);
      return rows.map(toMessage);
    },
    async dueToClose(now) {
      const rows = await db
        .select({ c: consultations })
        .from(consultations)
        .innerJoin(appointments, eq(appointments.id, consultations.appointmentId))
        .where(and(inArray(consultations.status, ['WAITING', 'ACTIVE']), graceClosed(now)));
      return rows.map((r) => r.c);
    },
    async unjoinedClosedAppointments(now) {
      const rows = await db
        .select({ id: appointments.id })
        .from(appointments)
        .leftJoin(consultations, eq(consultations.appointmentId, appointments.id))
        .where(and(eq(appointments.status, 'BOOKED'), isNull(consultations.id), graceClosed(now)));
      return rows.map((r) => r.id);
    },
  };
}
