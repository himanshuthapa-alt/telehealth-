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
import { DOCTOR_VERIFICATION_STATUSES, SPECIALIZATIONS } from '@telecare/shared';
import { language } from './patient-profile.schema';
import { users } from './users.schema';

export const specialization = pgEnum('specialization', SPECIALIZATIONS);
export const doctorVerification = pgEnum('doctor_verification', DOCTOR_VERIFICATION_STATUSES);

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
    /** Degrees as printed on a prescription, e.g. "MBBS, MD (Paediatrics)". */
    qualification: text(),
    isDemo: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    /**
     * Only APPROVED doctors are listed and bookable. Defaults to APPROVED because
     * provisioned (seeded) doctors are trusted; self-registration sets PENDING.
     */
    verificationStatus: doctorVerification().notNull().default('APPROVED'),
    verificationNote: text(),
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
