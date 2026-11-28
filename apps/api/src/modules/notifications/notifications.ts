import { Router } from 'express';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { NotificationList } from '@telecare/shared';
import type { DbExecutor } from '../../platform/db/client';
import { getActor, type AuthGuards } from '../../platform/http/auth';
import { notifications } from './notifications.schema';

export interface NewNotification {
  title: string;
  body: string;
  link: string | null;
}

/** Puts a message in someone's inbox. Services depend on this function, not on the table. */
export type Notify = (userId: string, n: NewNotification) => Promise<void>;

export function createNotifications(db: DbExecutor) {
  const notify: Notify = async (userId, n) => {
    await db.insert(notifications).values({ userId, ...n });
  };

  async function list(userId: string): Promise<NotificationList> {
    const [rows, [count]] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(50),
      db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
    ]);
    return {
      unread: count?.n ?? 0,
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        link: r.link,
        read: r.readAt !== null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  function routes(guards: AuthGuards): Router {
    const router = Router();
    // Own inbox only: the user comes from the token, so there is no id to tamper with.
    router.get('/v1/notifications', guards.requireAuth, async (_req, res) => {
      res.json(await list(getActor(res).id));
    });
    router.post('/v1/notifications/read', guards.requireAuth, async (_req, res) => {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, getActor(res).id), isNull(notifications.readAt)));
      res.status(204).end();
    });
    return router;
  }

  return { notify, routes };
}
