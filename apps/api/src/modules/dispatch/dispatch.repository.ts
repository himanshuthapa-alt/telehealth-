import { and, eq } from 'drizzle-orm';
import type { Database } from '../../platform/db/client';
import { doctorProfiles } from '../users/doctor-profile.schema';
import { users } from '../users/users.schema';
import { dispatchAttempts } from './dispatch.schema';

export type DispatchStatus = 'SENT' | 'ACCEPTED' | 'DECLINED' | 'TIMEOUT' | 'FAILED';

export interface DispatchRepository {
  createAttempt(input: {
    triageResultId: string;
    doctorId: string;
    channel: 'CALL' | 'SMS' | 'APP';
    attemptNo: number;
  }): Promise<string>;
  setStatus(attemptId: string, status: DispatchStatus): Promise<boolean>;
  /**
   * The paged doctor accepts/declines. Scoped to that doctor and to a still-open
   * (SENT) page, so one doctor can't respond to another doctor's page (IDOR).
   */
  respond(attemptId: string, doctorId: string, status: 'ACCEPTED' | 'DECLINED'): Promise<boolean>;
  countAttempts(triageResultId: string): Promise<number>;
  /** Doctor's phone for paging (private; from the users table, never sent to patients). */
  doctorPhone(doctorId: string): Promise<string | null>;
  /** Doctor's on-call toggle. Returns false if there is no such doctor profile. */
  setOnCall(doctorId: string, onCall: boolean): Promise<boolean>;
}

export function createDispatchRepository(db: Database): DispatchRepository {
  return {
    async createAttempt({ triageResultId, doctorId, channel, attemptNo }) {
      const [row] = await db
        .insert(dispatchAttempts)
        .values({ triageResultId, doctorId, channel, attemptNo })
        .returning({ id: dispatchAttempts.id });
      return row!.id;
    },
    async setStatus(attemptId, status) {
      const rows = await db
        .update(dispatchAttempts)
        .set({ status, respondedAt: status === 'SENT' ? null : new Date() })
        .where(eq(dispatchAttempts.id, attemptId))
        .returning({ id: dispatchAttempts.id });
      return rows.length === 1;
    },
    async respond(attemptId, doctorId, status) {
      const rows = await db
        .update(dispatchAttempts)
        .set({ status, respondedAt: new Date() })
        .where(
          and(
            eq(dispatchAttempts.id, attemptId),
            eq(dispatchAttempts.doctorId, doctorId),
            eq(dispatchAttempts.status, 'SENT'),
          ),
        )
        .returning({ id: dispatchAttempts.id });
      return rows.length === 1;
    },
    async countAttempts(triageResultId) {
      const rows = await db
        .select({ id: dispatchAttempts.id })
        .from(dispatchAttempts)
        .where(eq(dispatchAttempts.triageResultId, triageResultId));
      return rows.length;
    },
    async doctorPhone(doctorId) {
      const [row] = await db
        .select({ phone: users.phone })
        .from(users)
        .where(and(eq(users.id, doctorId), eq(users.role, 'DOCTOR')));
      return row?.phone ?? null;
    },
    async setOnCall(doctorId, onCall) {
      const rows = await db
        .update(doctorProfiles)
        .set({ onCall, updatedAt: new Date() })
        .where(eq(doctorProfiles.userId, doctorId))
        .returning({ id: doctorProfiles.userId });
      return rows.length === 1;
    },
  };
}
