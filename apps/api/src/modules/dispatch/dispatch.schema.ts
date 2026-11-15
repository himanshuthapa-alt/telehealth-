import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { consultations } from '../consultations/consultations.schema';
import { triageResults } from '../triage/triage.schema';
import { users } from '../users/users.schema';

export const dispatchChannel = pgEnum('dispatch_channel', ['CALL', 'SMS', 'APP']);
export const dispatchStatus = pgEnum('dispatch_status', [
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'TIMEOUT',
  'FAILED',
]);

/** One urgent page to one doctor. The escalation ladder is a pure function (escalation.ts). */
export const dispatchAttempts = pgTable(
  'dispatch_attempts',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    triageResultId: uuid()
      .notNull()
      .references(() => triageResults.id, { onDelete: 'cascade' }),
    doctorId: uuid()
      .notNull()
      .references(() => users.id),
    channel: dispatchChannel().notNull().default('APP'),
    status: dispatchStatus().notNull().default('SENT'),
    attemptNo: integer().notNull().default(1),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.triageResultId)],
);

/** Masked doctor<->patient phone pair (project map §6.5). No recordings by default. */
export const callbackSessions = pgTable('callback_sessions', {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  consultationId: uuid()
    .notNull()
    .references(() => consultations.id, { onDelete: 'cascade' }),
  provider: text().notNull(),
  virtualNumber: text(),
  providerPairId: text(),
  status: text().notNull().default('ACTIVE'),
  lastCallDurationS: integer(),
  expiresAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
