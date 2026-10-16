import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { APPOINTMENT_STATUSES } from '@telecare/shared';
import { users } from '../users/users.schema';

export const appointmentStatus = pgEnum('appointment_status', APPOINTMENT_STATUSES);
export const appointmentParty = pgEnum('appointment_party', ['PATIENT', 'DOCTOR']);

/**
 * A booked consultation time. Overlapping BOOKED appointments for the same
 * doctor or the same patient are impossible: exclusion constraints in
 * migration 0005 enforce it, so even two simultaneous requests can't double-book.
 */
export const appointments = pgTable(
  'appointments',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    patientId: uuid()
      .notNull()
      .references(() => users.id),
    doctorId: uuid()
      .notNull()
      .references(() => users.id),
    startAt: timestamp({ withTimezone: true }).notNull(),
    endAt: timestamp({ withTimezone: true }).notNull(),
    status: appointmentStatus().notNull().default('BOOKED'),
    reasonNote: text(),
    /** Sent by the app with every booking attempt; a retry with the same key returns the same appointment. */
    idempotencyKey: uuid().notNull(),
    cancelledBy: appointmentParty(),
    cancelReason: text(),
    cancelledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('appointments_patient_idempotency_key').on(t.patientId, t.idempotencyKey),
    index().on(t.doctorId, t.startAt),
    index().on(t.patientId, t.startAt),
    check('appointment_end_after_start', sql`${t.endAt} > ${t.startAt}`),
  ],
);
