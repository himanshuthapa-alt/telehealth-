import { date, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { GENDERS, LANGUAGES } from '@telecare/shared';
import { users } from './users.schema';

export const gender = pgEnum('gender', GENDERS);
export const language = pgEnum('language', LANGUAGES);

/** Optional patient details. No medical data here (blueprint §11). */
export const patientProfiles = pgTable('patient_profiles', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  dateOfBirth: date({ mode: 'string' }),
  gender: gender(),
  preferredLanguage: language(),
  district: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
