import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { language } from '../users/patient-profile.schema';
import { specialization } from '../users/doctor-profile.schema';
import { users } from '../users/users.schema';

export const URGENT_REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'EXHAUSTED', 'CANCELLED'] as const;
export const urgentRequestStatus = pgEnum('urgent_request_status', URGENT_REQUEST_STATUSES);

/** Minimal request data for a doctor callback queue; raw audio is never stored. */
export const urgentRequests = pgTable(
  'urgent_requests',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    patientId: uuid()
      .notNull()
      .references(() => users.id),
    symptoms: text().notNull(),
    recommendedSpecialization: specialization().notNull(),
    language: language(),
    candidateDoctorIds: uuid().array().notNull(),
    candidateIndex: integer().notNull().default(0),
    idempotencyKey: uuid(),
    assignedDoctorId: uuid().references(() => users.id),
    status: urgentRequestStatus().notNull().default('PENDING'),
    assignedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('urgent_requests_patient_created').on(t.patientId, t.createdAt),
    index('urgent_requests_assignee_status').on(t.assignedDoctorId, t.status, t.assignedAt),
    index('urgent_requests_status_assigned').on(t.status, t.assignedAt),
    uniqueIndex('urgent_requests_patient_idempotency')
      .on(t.patientId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
);
