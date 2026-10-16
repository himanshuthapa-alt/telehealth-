import { and, asc, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import {
  DOCTOR_PAGE_SIZE,
  addDays,
  istDate,
  istParts,
  toHHMM,
  type DoctorCard,
  type DoctorDetail,
  type DoctorSearchParams,
  type Page,
} from '@telecare/shared';
import type { Database } from '../../platform/db/client';
import { availabilityExceptions, availabilityRules } from '../scheduling/scheduling.schema';
import { doctorProfiles } from '../users/doctor-profile.schema';
import { users } from '../users/users.schema';

/**
 * Read-only view of the doctor directory (blueprint §9: discovery is a read
 * model over doctor profiles). Business code depends on this interface (D1).
 */
export interface DoctorDirectory {
  search(params: DoctorSearchParams): Promise<Page<DoctorCard>>;
  /** Null if there is no active doctor with this id. */
  get(id: string): Promise<DoctorDetail | null>;
}

// Only public fields. registration_number is deliberately absent.
const cardColumns = {
  id: users.id,
  name: users.fullName,
  specializations: doctorProfiles.specializations,
  languages: doctorProfiles.languages,
  experienceYears: doctorProfiles.experienceYears,
  feeInr: doctorProfiles.feeInr,
  ratingAvg: doctorProfiles.ratingAvg,
  ratingCount: doctorProfiles.ratingCount,
  photoUrl: doctorProfiles.photoUrl,
  isDemo: doctorProfiles.isDemo,
};

const ORDER_BY: Record<NonNullable<DoctorSearchParams['sort']>, SQL[]> = {
  rating: [sql`${doctorProfiles.ratingAvg} DESC NULLS LAST`, desc(doctorProfiles.ratingCount)],
  experience: [desc(doctorProfiles.experienceYears)],
  fee: [asc(doctorProfiles.feeInr)],
};

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function createDoctorDirectory(db: Database, now: () => Date = () => new Date()): DoctorDirectory {
  const visible = and(eq(users.role, 'DOCTOR'), eq(doctorProfiles.isActive, true));

  return {
    async search({ q, specialization, language, minRating, available, sort = 'rating', page = 1 }) {
      const filters: (SQL | undefined)[] = [visible];
      if (q) {
        const pattern = likePattern(q);
        // ponytail: ILIKE scan, fine for hundreds of doctors; add pg_trgm indexes if the directory grows large
        filters.push(
          sql`(${users.fullName} ILIKE ${pattern} OR array_to_string(${doctorProfiles.specializations}, ' ') ILIKE ${pattern})`,
        );
      }
      if (specialization)
        filters.push(sql`${doctorProfiles.specializations} @> ARRAY[${specialization}]::specialization[]`);
      if (language) filters.push(sql`${doctorProfiles.languages} @> ARRAY[${language}]::language[]`);
      if (minRating !== undefined) filters.push(gte(doctorProfiles.ratingAvg, minRating));
      if (available) {
        const today = istDate(now());
        const last = available === 'today' ? today : addDays(today, 6);
        const p = istParts(now());
        const clock = toHHMM(p.hour * 60 + p.minute);
        // Has consulting hours on a non-blocked day in the window (today: hours not yet over).
        // ponytail: ignores whether every slot is already booked; count free slots if that misleads users
        filters.push(sql`EXISTS (
          SELECT 1 FROM generate_series(${today}::date, ${last}::date, interval '1 day') AS d(day)
          JOIN ${availabilityRules} r ON r.doctor_id = ${doctorProfiles.userId} AND r.weekday = extract(isodow FROM d.day)
          WHERE (d.day::date > ${today}::date OR r.end_time > ${clock}::time)
            AND NOT EXISTS (SELECT 1 FROM ${availabilityExceptions} e WHERE e.doctor_id = r.doctor_id AND e.date = d.day::date))`);
      }

      const rows = await db
        .select({ ...cardColumns, total: sql<number>`count(*) OVER ()`.mapWith(Number) })
        .from(doctorProfiles)
        .innerJoin(users, eq(users.id, doctorProfiles.userId))
        .where(and(...filters))
        // Name then id as tie-breakers, so paging never skips or repeats a doctor.
        .orderBy(...ORDER_BY[sort], asc(users.fullName), asc(users.id))
        .limit(DOCTOR_PAGE_SIZE)
        .offset((page - 1) * DOCTOR_PAGE_SIZE);

      const total = rows[0]?.total ?? 0;
      return {
        items: rows.map(({ total: _total, ...card }) => card),
        page,
        pageSize: DOCTOR_PAGE_SIZE,
        total,
      };
    },

    async get(id) {
      const [row] = await db
        .select({ ...cardColumns, bio: doctorProfiles.bio })
        .from(doctorProfiles)
        .innerJoin(users, eq(users.id, doctorProfiles.userId))
        .where(and(visible, eq(users.id, id)));
      return row ?? null;
    },
  };
}
