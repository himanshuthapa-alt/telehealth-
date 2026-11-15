import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { SPECIALIZATIONS } from '@telecare/shared';
import { language } from './patient-profile.schema';
import { users } from './users.schema';

export const specialization = pgEnum('specialization', SPECIALIZATIONS);

/** Where a doctor comes from: our own directory, or a contracted partner network (project map §4). */
export const doctorSource = pgEnum('doctor_source', ['OWN', 'PARTNER']);

/** Public doctor details, plus private ones (registration number) that are never sent to clients. */
export const doctorProfiles = pgTable(
  'doctor_profiles',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    specializations: specialization().array().notNull(),
    languages: language().array().notNull(),
    experienceYears: integer().notNull(),
    bio: text().notNull().default(''),
    feeInr: integer().notNull(),
    ratingAvg: numeric({ precision: 2, scale: 1, mode: 'number' }),
    ratingCount: integer().notNull().default(0),
    photoUrl: text(),
    /** Medical council registration. Private: never returned by the API. */
    registrationNumber: text(),
    /** Accepts urgent voice pages right now (project map §6.3). Doctor toggles it. */
    onCall: boolean().notNull().default(false),
    source: doctorSource().notNull().default('OWN'),
    /** Set for PARTNER doctors; null for our own. No FK yet (partners module is later). */
    partnerProviderId: uuid(),
    /** Throttle for urgent paging so one doctor isn't flooded. */
    maxUrgentPerHour: integer().notNull().default(6),
    isDemo: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('doctor_has_specialization', sql`cardinality(${t.specializations}) >= 1`),
    check('doctor_has_language', sql`cardinality(${t.languages}) >= 1`),
    check('doctor_experience_range', sql`${t.experienceYears} BETWEEN 0 AND 70`),
    check('doctor_fee_non_negative', sql`${t.feeInr} >= 0`),
    check('doctor_rating_range', sql`${t.ratingAvg} BETWEEN 0 AND 5`),
  ],
);
