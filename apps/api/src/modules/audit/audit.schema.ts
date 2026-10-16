import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { userRole } from '../users/users.schema';

/**
 * Append-only record of security-relevant actions. A database trigger
 * (migration 0001) rejects UPDATE and DELETE. Metadata must never hold health data.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // No foreign key on purpose: the audit trail outlives the rows it mentions.
    actorId: uuid(),
    actorRole: userRole(),
    action: text().notNull(),
    entityType: text(),
    entityId: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    ip: text(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.actorId), index().on(t.at)],
);
