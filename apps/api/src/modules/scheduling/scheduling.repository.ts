import { and, asc, between, eq, gte } from 'drizzle-orm';
import type { Availability, AvailabilityRule } from '@telecare/shared';
import type { Database } from '../../platform/db/client';
import { doctorProfiles } from '../users/doctor-profile.schema';
import { availabilityExceptions, availabilityRules } from './scheduling.schema';

/** Storage for doctors' hours. Business code depends on this interface (D1). */
export interface ScheduleRepository {
  /** Rules and blocked dates from `today` on. */
  getAvailability(doctorId: string, today: string): Promise<Availability>;
  replaceRules(doctorId: string, rules: AvailabilityRule[]): Promise<void>;
  blockDate(doctorId: string, date: string, reason: string | null): Promise<void>;
  /** False if the date wasn't blocked. */
  unblockDate(doctorId: string, date: string): Promise<boolean>;
  /** What slot calculation needs. Rules are empty for an inactive doctor, so nobody can book them. */
  forSlots(
    doctorId: string,
    from: string,
    to: string,
  ): Promise<{ rules: AvailabilityRule[]; blockedDates: Set<string> }>;
}

const ruleColumns = {
  weekday: availabilityRules.weekday,
  startTime: availabilityRules.startTime,
  endTime: availabilityRules.endTime,
  slotMinutes: availabilityRules.slotMinutes,
};
// Postgres returns "HH:MM:SS"; the API speaks "HH:MM".
const toRule = (r: {
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
}): AvailabilityRule => ({
  ...r,
  startTime: r.startTime.slice(0, 5),
  endTime: r.endTime.slice(0, 5),
});

export function createScheduleRepository(db: Database): ScheduleRepository {
  return {
    async getAvailability(doctorId, today) {
      const rules = await db
        .select(ruleColumns)
        .from(availabilityRules)
        .where(eq(availabilityRules.doctorId, doctorId))
        .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime));
      const exceptions = await db
        .select({ date: availabilityExceptions.date, reason: availabilityExceptions.reason })
        .from(availabilityExceptions)
        .where(and(eq(availabilityExceptions.doctorId, doctorId), gte(availabilityExceptions.date, today)))
        .orderBy(asc(availabilityExceptions.date));
      return { rules: rules.map(toRule), exceptions };
    },

    replaceRules: (doctorId, rules) =>
      db.transaction(async (tx) => {
        await tx.delete(availabilityRules).where(eq(availabilityRules.doctorId, doctorId));
        if (rules.length) await tx.insert(availabilityRules).values(rules.map((r) => ({ ...r, doctorId })));
      }),

    async blockDate(doctorId, date, reason) {
      await db
        .insert(availabilityExceptions)
        .values({ doctorId, date, reason })
        .onConflictDoUpdate({
          target: [availabilityExceptions.doctorId, availabilityExceptions.date],
          set: { reason },
        });
    },

    async unblockDate(doctorId, date) {
      const rows = await db
        .delete(availabilityExceptions)
        .where(and(eq(availabilityExceptions.doctorId, doctorId), eq(availabilityExceptions.date, date)))
        .returning({ date: availabilityExceptions.date });
      return rows.length > 0;
    },

    async forSlots(doctorId, from, to) {
      const rules = await db
        .select(ruleColumns)
        .from(availabilityRules)
        .innerJoin(doctorProfiles, eq(doctorProfiles.userId, availabilityRules.doctorId))
        .where(and(eq(availabilityRules.doctorId, doctorId), eq(doctorProfiles.isActive, true)));
      const blocked = await db
        .select({ date: availabilityExceptions.date })
        .from(availabilityExceptions)
        .where(
          and(eq(availabilityExceptions.doctorId, doctorId), between(availabilityExceptions.date, from, to)),
        );
      return { rules: rules.map(toRule), blockedDates: new Set(blocked.map((b) => b.date)) };
    },
  };
}
