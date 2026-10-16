import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { FREQUENCY_KEYS, PRESCRIPTION_STATUSES } from '@telecare/shared';
import { consultations } from '../consultations/consultations.schema';
import { medicines } from '../pharmacy/pharmacy.schema';
import { users } from '../users/users.schema';

export const prescriptionStatus = pgEnum('prescription_status', PRESCRIPTION_STATUSES);
export const frequency = pgEnum('frequency', FREQUENCY_KEYS as [string, ...string[]]);

/**
 * Immutable once ISSUED (blueprint §11): database triggers in migration 0007
 * refuse edits to issued/voided prescriptions and their items. A correction is
 * a VOID plus a new prescription with `supersedes_id`.
 */
export const prescriptions = pgTable(
  'prescriptions',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    consultationId: uuid()
      .notNull()
      .references(() => consultations.id),
    doctorId: uuid()
      .notNull()
      .references(() => users.id),
    patientId: uuid()
      .notNull()
      .references(() => users.id),
    status: prescriptionStatus().notNull().default('DRAFT'),
    generalInstructions: text(),
    validDays: integer().notNull().default(30),
    issuedAt: timestamp({ withTimezone: true }),
    validUntil: date({ mode: 'string' }),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    supersedesId: uuid().references((): AnyPgColumn => prescriptions.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.patientId),
    index().on(t.doctorId),
    // At most one draft and one in-force prescription per consultation.
    uniqueIndex('prescriptions_one_draft')
      .on(t.consultationId)
      .where(sql`${t.status} = 'DRAFT'`),
    uniqueIndex('prescriptions_one_issued')
      .on(t.consultationId)
      .where(sql`${t.status} = 'ISSUED'`),
    check('prescription_valid_days_range', sql`${t.validDays} BETWEEN 1 AND 180`),
  ],
);

export const prescriptionItems = pgTable(
  'prescription_items',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    prescriptionId: uuid()
      .notNull()
      .references(() => prescriptions.id),
    position: integer().notNull(),
    /** Null when the medicine isn't in the pharmacy catalog (still prescribable). */
    medicineId: uuid().references(() => medicines.id),
    /** The name as prescribed, kept even if the catalog entry changes later. */
    medicineName: text().notNull(),
    dosage: text().notNull(),
    frequency: frequency().notNull(),
    durationDays: integer().notNull(),
    quantity: integer().notNull(),
    instructions: text(),
  },
  (t) => [
    index().on(t.prescriptionId),
    check('item_duration_range', sql`${t.durationDays} BETWEEN 1 AND 365`),
    check('item_quantity_range', sql`${t.quantity} BETWEEN 1 AND 1000`),
  ],
);
