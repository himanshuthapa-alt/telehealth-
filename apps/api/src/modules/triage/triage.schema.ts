import { sql } from 'drizzle-orm';
import { boolean, index, numeric, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { URGENCY_LEVELS } from '@telecare/shared';
import { specialization } from '../users/doctor-profile.schema';
import { voiceTurns } from '../voice/voice.schema';

export const urgency = pgEnum('urgency', URGENCY_LEVELS);

/** Controlled symptom vocabulary the LLM must pick from (seeded from @telecare/shared SYMPTOM_TAGS). */
export const symptomTags = pgTable('symptom_tags', {
  code: text().primaryKey(),
  labelEn: text().notNull(),
  labelHi: text().notNull(),
  labelGbm: text(),
  isRedFlag: boolean().notNull().default(false),
  defaultUrgency: urgency().notNull().default('ROUTINE'),
});

/** tag -> specialty routing (weighted). A clinician reviews this before real use (project map §14). */
export const symptomTagSpecialty = pgTable(
  'symptom_tag_specialty',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tagCode: text()
      .notNull()
      .references(() => symptomTags.code, { onDelete: 'cascade' }),
    specialization: specialization().notNull(),
    weight: numeric({ precision: 3, scale: 2, mode: 'number' }).notNull().default(1),
    /** e.g. 'child' -> Pediatrics. Null = applies to all ages. */
    ageBand: text(),
  },
  (t) => [unique('symptom_tag_specialty_pair').on(t.tagCode, t.specialization, t.ageBand)],
);

/** Append-only triage outcome for one turn (project map §9). */
export const triageResults = pgTable('triage_results', {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  turnId: uuid()
    .notNull()
    .references(() => voiceTurns.id, { onDelete: 'cascade' }),
  urgency: urgency().notNull(),
  emergencyReason: text(),
  specialization: specialization(),
  summaryForDoctor: text(),
  model: text(),
  promptVersion: text(),
  /** Which deterministic red-flag rules fired. */
  ruleHits: text()
    .array()
    .notNull()
    .default(sql`'{}'`),
  patientConfirmedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const triageResultTags = pgTable(
  'triage_result_tags',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    triageResultId: uuid()
      .notNull()
      .references(() => triageResults.id, { onDelete: 'cascade' }),
    tagCode: text().notNull(),
    confidence: numeric({ precision: 3, scale: 2, mode: 'number' }),
  },
  (t) => [index().on(t.triageResultId)],
);
