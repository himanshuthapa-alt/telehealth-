import { sql } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { ROLES } from '@telecare/shared';

export const userRole = pgEnum('user_role', ROLES);

export const users = pgTable('users', {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /** E.164, e.g. +919876543210 */
  phone: text().notNull().unique(),
  fullName: text().notNull(),
  passwordHash: text().notNull(),
  role: userRole().notNull(),
  /** When the user accepted the privacy notice. Null for provisioned staff accounts. */
  consentAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
