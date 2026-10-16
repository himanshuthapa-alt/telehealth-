import { eq } from 'drizzle-orm';
import type { PatientProfile, UpdatePatientProfileRequest } from '@telecare/shared';
import type { Database } from '../../platform/db/client';
import { patientProfiles } from './patient-profile.schema';
import { users } from './users.schema';

/** Patient details. Business rules depend on this interface, not on PostgreSQL (decision D1). */
export interface PatientProfileRepository {
  get(userId: string): Promise<PatientProfile | null>;
  /** Applies the patch atomically (name on users, the rest on patient_profiles) and returns the result. */
  update(userId: string, patch: UpdatePatientProfileRequest): Promise<PatientProfile | null>;
}

export function createPatientProfileRepository(db: Database): PatientProfileRepository {
  async function get(userId: string, exec: Pick<Database, 'select'> = db) {
    const [row] = await exec
      .select({
        fullName: users.fullName,
        phone: users.phone,
        consentAt: users.consentAt,
        dateOfBirth: patientProfiles.dateOfBirth,
        gender: patientProfiles.gender,
        preferredLanguage: patientProfiles.preferredLanguage,
        district: patientProfiles.district,
      })
      .from(users)
      .leftJoin(patientProfiles, eq(patientProfiles.userId, users.id))
      .where(eq(users.id, userId));
    if (!row) return null;
    return { ...row, consentAt: row.consentAt?.toISOString() ?? null };
  }

  return {
    get: (userId) => get(userId),
    update: (userId, { fullName, ...details }) =>
      db.transaction(async (tx) => {
        const now = new Date();
        if (fullName !== undefined)
          await tx.update(users).set({ fullName, updatedAt: now }).where(eq(users.id, userId));
        if (Object.keys(details).length > 0)
          await tx
            .insert(patientProfiles)
            .values({ userId, ...details, updatedAt: now })
            .onConflictDoUpdate({ target: patientProfiles.userId, set: { ...details, updatedAt: now } });
        return get(userId, tx);
      }),
  };
}
