import { and, eq, sql } from 'drizzle-orm';
import { SYMPTOM_TAGS } from '@telecare/shared';
import type { Database } from './platform/db/client';
import { symptomTagSpecialty, symptomTags } from './modules/triage/triage.schema';
import { doctorProfiles } from './modules/users/doctor-profile.schema';

/**
 * Seeds the controlled symptom vocabulary (symptom_tags + symptom_tag_specialty)
 * from @telecare/shared, and turns on a few demo on-call doctors so the urgent
 * lane has someone to page. Idempotent (onConflictDoNothing), like the other seeds.
 *
 * ⚠️ A clinician must review this routing table before any real use.
 */
export async function seedTriage(db: Database): Promise<{ tags: number; routes: number; onCall: number }> {
  const tagRows = SYMPTOM_TAGS.map((t) => ({
    code: t.code,
    labelEn: t.labelEn,
    labelHi: t.labelHi,
    labelGbm: t.labelGbm,
    isRedFlag: false,
    defaultUrgency: t.urgency,
  }));
  const tags = await db
    .insert(symptomTags)
    .values(tagRows)
    .onConflictDoNothing()
    .returning({ code: symptomTags.code });

  const routeRows = SYMPTOM_TAGS.flatMap((t) => {
    const rows = [
      { tagCode: t.code, specialization: t.specialization, weight: 1, ageBand: null as string | null },
    ];
    if (t.childTo) rows.push({ tagCode: t.code, specialization: t.childTo, weight: 1, ageBand: 'child' });
    return rows;
  });
  const routes = await db
    .insert(symptomTagSpecialty)
    .values(routeRows)
    .onConflictDoNothing()
    .returning({ id: symptomTagSpecialty.id });

  // Put the top-rated demo doctor in each of these specialties on call.
  const onCallSpecs = ['General Physician', 'Pediatrics', 'Cardiology', 'ENT'];
  let onCall = 0;
  for (const spec of onCallSpecs) {
    const [doc] = await db
      .select({ id: doctorProfiles.userId })
      .from(doctorProfiles)
      .where(
        and(
          eq(doctorProfiles.isDemo, true),
          sql`${doctorProfiles.specializations} @> ARRAY[${spec}]::specialization[]`,
        ),
      )
      .orderBy(sql`${doctorProfiles.ratingAvg} DESC NULLS LAST`)
      .limit(1);
    if (doc) {
      await db.update(doctorProfiles).set({ onCall: true }).where(eq(doctorProfiles.userId, doc.id));
      onCall += 1;
    }
  }

  return { tags: tags.length, routes: routes.length, onCall };
}
