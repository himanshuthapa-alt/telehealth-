import { aliasedTable, and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { Prescription, PrescriptionItemInput, PrescriptionStatus } from '@telecare/shared';
import type { Database } from '../../platform/db/client';
import { ageOn } from '../appointments/appointments.repository';
import { patientProfiles } from '../users/patient-profile.schema';
import { doctorProfiles } from '../users/doctor-profile.schema';
import { users } from '../users/users.schema';
import { prescriptionItems, prescriptions } from './prescriptions.schema';

export type PrescriptionRow = typeof prescriptions.$inferSelect;

/** Storage for prescriptions (D1). The database itself refuses edits to issued ones. */
export interface PrescriptionRepository {
  row(id: string): Promise<PrescriptionRow | null>;
  view(id: string): Promise<Prescription | null>;
  /** The draft for this consultation, creating it if there is none (safe under races). */
  draftFor(c: {
    consultationId: string;
    doctorId: string;
    patientId: string;
    supersedesId?: string | null;
  }): Promise<string>;
  /** Replaces a draft's content in one transaction. */
  save(
    id: string,
    input: { items: PrescriptionItemInput[]; generalInstructions: string | null; validDays: number },
  ): Promise<void>;
  /** DRAFT → ISSUED. Returns 'ALREADY_ISSUED' if the consultation already has one in force. */
  issue(id: string, issuedAt: Date, validUntil: string): Promise<'OK' | 'ALREADY_ISSUED' | 'NOT_DRAFT'>;
  voidIt(id: string, reason: string, at: Date): Promise<boolean>;
  itemsOf(id: string): Promise<PrescriptionItemInput[]>;
  list(filter: {
    patientId?: string;
    doctorId?: string;
    consultationId?: string;
    includeDrafts: boolean;
  }): Promise<Prescription[]>;
}

const doctorUser = aliasedTable(users, 'rx_doctor');
const patientUser = aliasedTable(users, 'rx_patient');

function pgConstraint(err: unknown): string | undefined {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause)
    if ('constraint' in e && typeof e.constraint === 'string') return e.constraint;
  return undefined;
}

export function createPrescriptionRepository(
  db: Database,
  now: () => Date = () => new Date(),
): PrescriptionRepository {
  async function views(where: ReturnType<typeof and>, order: 'issued' | 'created'): Promise<Prescription[]> {
    const rows = await db
      .select({
        p: prescriptions,
        doctorName: doctorUser.fullName,
        doctorQualification: doctorProfiles.qualification,
        doctorRegistration: doctorProfiles.registrationNumber,
        patientName: patientUser.fullName,
        patientDob: patientProfiles.dateOfBirth,
      })
      .from(prescriptions)
      .innerJoin(doctorUser, eq(doctorUser.id, prescriptions.doctorId))
      // ponytail: shows the doctor's current details, not a copy taken at issue; snapshot them if doctors' numbers ever change
      .leftJoin(doctorProfiles, eq(doctorProfiles.userId, prescriptions.doctorId))
      .innerJoin(patientUser, eq(patientUser.id, prescriptions.patientId))
      .leftJoin(patientProfiles, eq(patientProfiles.userId, prescriptions.patientId))
      .where(where)
      .orderBy(
        order === 'issued' ? sql`${prescriptions.issuedAt} DESC NULLS FIRST` : desc(prescriptions.createdAt),
      )
      .limit(100);
    if (rows.length === 0) return [];
    const items = await db
      .select()
      .from(prescriptionItems)
      .where(sql`${prescriptionItems.prescriptionId} IN ${rows.map((r) => r.p.id)}`)
      .orderBy(asc(prescriptionItems.position));
    return rows.map(
      ({ p, doctorName, doctorQualification, doctorRegistration, patientName, patientDob }) => ({
        id: p.id,
        consultationId: p.consultationId,
        status: p.status,
        doctor: {
          id: p.doctorId,
          name: doctorName,
          qualification: doctorQualification,
          registrationNumber: doctorRegistration,
        },
        patient: { id: p.patientId, name: patientName, age: patientDob ? ageOn(patientDob, now()) : null },
        items: items
          .filter((i) => i.prescriptionId === p.id)
          .map((i) => ({
            id: i.id,
            medicineId: i.medicineId,
            medicineName: i.medicineName,
            dosage: i.dosage,
            frequency: i.frequency as Prescription['items'][number]['frequency'],
            durationDays: i.durationDays,
            quantity: i.quantity,
            instructions: i.instructions,
            inCatalog: i.medicineId !== null,
          })),
        generalInstructions: p.generalInstructions,
        validDays: p.validDays,
        validUntil: p.validUntil,
        issuedAt: p.issuedAt?.toISOString() ?? null,
        voidedAt: p.voidedAt?.toISOString() ?? null,
        voidReason: p.voidReason,
        supersedesId: p.supersedesId,
        createdAt: p.createdAt.toISOString(),
      }),
    );
  }

  return {
    async row(id) {
      const [r] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
      return r ?? null;
    },
    async view(id) {
      const [v] = await views(eq(prescriptions.id, id), 'created');
      return v ?? null;
    },
    async draftFor({ consultationId, doctorId, patientId, supersedesId = null }) {
      const [created] = await db
        .insert(prescriptions)
        .values({ consultationId, doctorId, patientId, supersedesId })
        .onConflictDoNothing()
        .returning({ id: prescriptions.id });
      if (created) return created.id;
      const [draft] = await db
        .select({ id: prescriptions.id })
        .from(prescriptions)
        .where(and(eq(prescriptions.consultationId, consultationId), eq(prescriptions.status, 'DRAFT')));
      return draft!.id;
    },
    save: (id, input) =>
      db.transaction(async (tx) => {
        await tx
          .update(prescriptions)
          .set({
            generalInstructions: input.generalInstructions,
            validDays: input.validDays,
            updatedAt: new Date(),
          })
          .where(and(eq(prescriptions.id, id), eq(prescriptions.status, 'DRAFT')));
        await tx.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, id));
        if (input.items.length)
          await tx
            .insert(prescriptionItems)
            .values(input.items.map((item, position) => ({ ...item, prescriptionId: id, position })));
      }),
    async issue(id, issuedAt, validUntil) {
      try {
        const rows = await db
          .update(prescriptions)
          .set({ status: 'ISSUED', issuedAt, validUntil, updatedAt: issuedAt })
          .where(and(eq(prescriptions.id, id), eq(prescriptions.status, 'DRAFT')))
          .returning({ id: prescriptions.id });
        return rows.length ? 'OK' : 'NOT_DRAFT';
      } catch (err) {
        if (pgConstraint(err) === 'prescriptions_one_issued') return 'ALREADY_ISSUED';
        throw err;
      }
    },
    async voidIt(id, reason, at) {
      const rows = await db
        .update(prescriptions)
        .set({ status: 'VOIDED', voidReason: reason, voidedAt: at, updatedAt: at })
        .where(and(eq(prescriptions.id, id), eq(prescriptions.status, 'ISSUED')))
        .returning({ id: prescriptions.id });
      return rows.length === 1;
    },
    async itemsOf(id) {
      const rows = await db
        .select()
        .from(prescriptionItems)
        .where(eq(prescriptionItems.prescriptionId, id))
        .orderBy(asc(prescriptionItems.position));
      return rows.map(
        ({ medicineId, medicineName, dosage, frequency, durationDays, quantity, instructions }) => ({
          medicineId,
          medicineName,
          dosage,
          frequency: frequency as PrescriptionItemInput['frequency'],
          durationDays,
          quantity,
          instructions,
        }),
      );
    },
    list({ patientId, doctorId, consultationId, includeDrafts }) {
      return views(
        and(
          patientId ? eq(prescriptions.patientId, patientId) : undefined,
          doctorId ? eq(prescriptions.doctorId, doctorId) : undefined,
          consultationId ? eq(prescriptions.consultationId, consultationId) : undefined,
          includeDrafts ? undefined : ne(prescriptions.status, 'DRAFT' as PrescriptionStatus),
        ),
        'issued',
      );
    },
  };
}
