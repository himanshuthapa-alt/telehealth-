import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  addDays,
  istDate,
  istInstant,
  type DoctorForReview,
  type DoctorProfileFields,
  type DoctorStats,
  type DoctorVerificationStatus,
  type MyDoctorProfile,
  type UpdateDoctorProfileRequest,
} from '@telecare/shared';
import type { DbExecutor } from '../../platform/db/client';
import { appointments } from '../appointments/appointments.schema';
import { doctorProfiles } from './doctor-profile.schema';
import { users } from './users.schema';

const editable = {
  qualification: sql<string>`coalesce(${doctorProfiles.qualification}, '')`,
  specializations: doctorProfiles.specializations,
  languages: doctorProfiles.languages,
  experienceYears: doctorProfiles.experienceYears,
  feeInr: doctorProfiles.feeInr,
  bio: doctorProfiles.bio,
};

const ownColumns = {
  ...editable,
  fullName: users.fullName,
  registrationNumber: doctorProfiles.registrationNumber,
  verificationStatus: doctorProfiles.verificationStatus,
  verificationNote: doctorProfiles.verificationNote,
};

/** A doctor's own profile and dashboard numbers, plus the admin verification queue. */
export function createDoctorProfileRepository(db: DbExecutor, now: () => Date = () => new Date()) {
  async function getOwn(userId: string): Promise<MyDoctorProfile | null> {
    const [row] = await db
      .select(ownColumns)
      .from(doctorProfiles)
      .innerJoin(users, eq(users.id, doctorProfiles.userId))
      .where(eq(doctorProfiles.userId, userId));
    return row ?? null;
  }

  return {
    /** Self-registration: the profile starts PENDING until an admin approves it. */
    async createPending(userId: string, fields: DoctorProfileFields & { registrationNumber: string }) {
      await db.insert(doctorProfiles).values({ userId, ...fields, verificationStatus: 'PENDING' });
    },

    getOwn,

    /** True for a doctor whose profile is PENDING or REJECTED. Provisioned doctors without a profile pass. */
    async isBlocked(doctorId: string): Promise<boolean> {
      const [row] = await db
        .select({ status: doctorProfiles.verificationStatus })
        .from(doctorProfiles)
        .where(eq(doctorProfiles.userId, doctorId));
      return !!row && row.status !== 'APPROVED';
    },

    async updateOwn(userId: string, patch: UpdateDoctorProfileRequest): Promise<MyDoctorProfile | null> {
      if (Object.keys(patch).length)
        await db
          .update(doctorProfiles)
          .set({ ...patch, updatedAt: now() })
          .where(eq(doctorProfiles.userId, userId));
      return getOwn(userId);
    },

    async stats(userId: string): Promise<DoctorStats> {
      const today = istDate(now());
      const mine = eq(appointments.doctorId, userId);
      const count = sql<number>`count(*)`.mapWith(Number);
      const [[t], [u], [c], [p]] = await Promise.all([
        db
          .select({ n: count })
          .from(appointments)
          .where(
            and(
              mine,
              sql`${appointments.status} <> 'CANCELLED'`,
              gte(appointments.startAt, istInstant(today, 0)),
              lt(appointments.startAt, istInstant(addDays(today, 1), 0)),
            ),
          ),
        db
          .select({ n: count })
          .from(appointments)
          .where(and(mine, eq(appointments.status, 'BOOKED'), gte(appointments.startAt, now()))),
        db
          .select({ n: count })
          .from(appointments)
          .where(and(mine, eq(appointments.status, 'COMPLETED'))),
        db
          .select({ fee: doctorProfiles.feeInr })
          .from(doctorProfiles)
          .where(eq(doctorProfiles.userId, userId)),
      ]);
      const completed = c?.n ?? 0;
      return {
        today: t?.n ?? 0,
        upcoming: u?.n ?? 0,
        completed,
        // ponytail: uses today's fee for past consults; store the fee on each appointment if fees change often
        earningsInr: completed * (p?.fee ?? 0),
      };
    },

    /** Admin queue. Newest sign-ups first. */
    async listForReview(status: DoctorVerificationStatus): Promise<DoctorForReview[]> {
      const rows = await db
        .select({
          ...ownColumns,
          id: users.id,
          phone: users.phone,
          createdAt: users.createdAt,
        })
        .from(doctorProfiles)
        .innerJoin(users, eq(users.id, doctorProfiles.userId))
        .where(and(eq(doctorProfiles.verificationStatus, status), eq(doctorProfiles.isDemo, false)))
        .orderBy(desc(users.createdAt), asc(users.id))
        .limit(200);
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    },

    /**
     * Returns false if there is no such doctor. Rejecting (including removing an
     * approval) also cancels the doctor's upcoming bookings, so no patient waits for them.
     */
    async setVerification(doctorId: string, status: DoctorVerificationStatus, note: string | null) {
      return db.transaction(async (tx) => {
        const rows = await tx
          .update(doctorProfiles)
          .set({ verificationStatus: status, verificationNote: note, updatedAt: now() })
          .where(eq(doctorProfiles.userId, doctorId))
          .returning({ id: doctorProfiles.userId });
        if (rows.length && status === 'REJECTED')
          await tx
            .update(appointments)
            .set({
              status: 'CANCELLED',
              cancelledBy: 'DOCTOR',
              cancelReason: 'The doctor is no longer available on TeleCare+',
              cancelledAt: now(),
              updatedAt: now(),
            })
            .where(
              and(
                eq(appointments.doctorId, doctorId),
                eq(appointments.status, 'BOOKED'),
                gte(appointments.startAt, now()),
              ),
            );
        return rows.length > 0;
      });
    },
  };
}

export type DoctorProfileRepository = ReturnType<typeof createDoctorProfileRepository>;
