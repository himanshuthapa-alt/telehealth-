import { and, desc, eq, sql } from 'drizzle-orm';
import type { Language, Specialization } from '@telecare/shared';
import type { Database } from '../../platform/db/client';
import { doctorProfiles } from '../users/doctor-profile.schema';
import { users } from '../users/users.schema';

export interface OnCallDoctor {
  id: string;
  name: string;
  specializations: Specialization[];
  languages: Language[];
  ratingAvg: number | null;
}

export interface MatchingRepository {
  /** Doctors who are on call now, for the urgent lane (project map §6.3). */
  onCall(params: { specialization: Specialization; language?: Language | null }): Promise<OnCallDoctor[]>;
}

export function createMatchingRepository(db: Database): MatchingRepository {
  return {
    async onCall({ specialization, language }) {
      const filters = [
        eq(users.role, 'DOCTOR'),
        eq(doctorProfiles.isActive, true),
        eq(doctorProfiles.onCall, true),
        sql`${doctorProfiles.specializations} @> ARRAY[${specialization}]::specialization[]`,
      ];
      if (language) filters.push(sql`${doctorProfiles.languages} @> ARRAY[${language}]::language[]`);
      const rows = await db
        .select({
          id: users.id,
          name: users.fullName,
          specializations: doctorProfiles.specializations,
          languages: doctorProfiles.languages,
          ratingAvg: doctorProfiles.ratingAvg,
        })
        .from(doctorProfiles)
        .innerJoin(users, eq(users.id, doctorProfiles.userId))
        .where(and(...filters))
        .orderBy(sql`${doctorProfiles.ratingAvg} DESC NULLS LAST`, desc(doctorProfiles.ratingCount))
        .limit(10);
      return rows as OnCallDoctor[];
    },
  };
}
