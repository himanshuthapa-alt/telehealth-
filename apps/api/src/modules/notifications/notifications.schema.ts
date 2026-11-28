import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/** In-app inbox (blueprint Phase 9). Text only: never health details beyond "your prescription is ready". */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    body: text().notNull(),
    /** App route to open, e.g. /patient/medicines/prescription/<id>. */
    link: text(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
