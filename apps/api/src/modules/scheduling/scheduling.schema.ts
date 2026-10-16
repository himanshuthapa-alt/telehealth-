import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, primaryKey, smallint, text, time, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/** A doctor's weekly consulting hours, in IST (blueprint §11). Slots are computed from these on demand. */
export const availabilityRules = pgTable(
  'availability_rules',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    doctorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** ISO weekday: 1 = Monday … 7 = Sunday. */
    weekday: smallint().notNull(),
    startTime: time().notNull(),
    endTime: time().notNull(),
    slotMinutes: smallint().notNull(),
  },
  (t) => [
    index().on(t.doctorId),
    check('rule_weekday_range', sql`${t.weekday} BETWEEN 1 AND 7`),
    check('rule_start_before_end', sql`${t.startTime} < ${t.endTime}`),
    check('rule_slot_minutes_range', sql`${t.slotMinutes} BETWEEN 5 AND 120`),
  ],
);

/** Days a doctor doesn't consult (leave, holidays). Existing bookings on that day are kept. */
export const availabilityExceptions = pgTable(
  'availability_exceptions',
  {
    doctorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date({ mode: 'string' }).notNull(),
    reason: text(),
  },
  (t) => [primaryKey({ columns: [t.doctorId, t.date] })],
);
