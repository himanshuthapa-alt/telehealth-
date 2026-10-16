import { sql } from 'drizzle-orm';
import { bigserial, index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { CONSULTATION_EVENT_TYPES, CONSULTATION_STATUSES, MESSAGE_TYPES } from '@telecare/shared';
import { appointments } from '../appointments/appointments.schema';
import { users } from '../users/users.schema';

export const consultationStatus = pgEnum('consultation_status', CONSULTATION_STATUSES);
export const consultationEventType = pgEnum('consultation_event_type', CONSULTATION_EVENT_TYPES);
export const messageType = pgEnum('message_type', MESSAGE_TYPES);

/** One per appointment, created at the first join (blueprint §11, §13). */
export const consultations = pgTable('consultations', {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  appointmentId: uuid()
    .notNull()
    .unique()
    .references(() => appointments.id),
  status: consultationStatus().notNull().default('WAITING'),
  /** Which video provider this consultation used ('none' = chat only). */
  provider: text().notNull(),
  providerRoomId: text(),
  startedAt: timestamp({ withTimezone: true }),
  endedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Who joined/left when: drives rejoin, no-show decisions and debugging. */
export const consultationEvents = pgTable(
  'consultation_events',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    consultationId: uuid()
      .notNull()
      .references(() => consultations.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    type: consultationEventType().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.consultationId)],
);

/**
 * Chat, stored on our server (decision D7) so it survives video failures.
 * `id` is an increasing number and doubles as the "messages after" cursor.
 */
export const messages = pgTable(
  'messages',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    consultationId: uuid()
      .notNull()
      .references(() => consultations.id),
    senderId: uuid().references(() => users.id),
    clientMsgId: uuid(),
    type: messageType().notNull().default('TEXT'),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A retried send can't create a second copy.
    unique('messages_sender_client_msg_id').on(t.senderId, t.clientMsgId),
    index().on(t.consultationId, t.id),
  ],
);
