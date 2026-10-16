import { aliasedTable, and, asc, desc, eq, gt, gte, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { istParts, type Appointment, type AppointmentScope, type Role } from '@telecare/shared';
import type { Database } from '../../platform/db/client';
import { doctorProfiles } from '../users/doctor-profile.schema';
import { patientProfiles } from '../users/patient-profile.schema';
import { users } from '../users/users.schema';
import { appointments } from './appointments.schema';

export interface NewAppointment {
  patientId: string;
  doctorId: string;
  startAt: Date;
  endAt: Date;
  reasonNote: string | null;
  idempotencyKey: string;
}

/** Why an insert was refused by a database constraint. */
export type InsertConflict = 'DOCTOR_BUSY' | 'PATIENT_BUSY' | 'DUPLICATE_KEY';

export interface AppointmentRepository {
  insert(a: NewAppointment): Promise<{ id: string } | InsertConflict>;
  findByIdempotencyKey(
    patientId: string,
    key: string,
  ): Promise<{ id: string; doctorId: string; startAt: Date } | null>;
  /** The appointment if `viewer` is its patient or its doctor; otherwise null (callers answer 404). */
  getFor(id: string, viewer: { id: string; role: Role }): Promise<Appointment | null>;
  list(
    viewer: { id: string; role: Role },
    scope: AppointmentScope,
    now: Date,
    todayRange: [Date, Date],
  ): Promise<Appointment[]>;
  /** BOOKED → CANCELLED, only if still BOOKED. Returns false if another request changed it first. */
  cancel(id: string, by: 'PATIENT' | 'DOCTOR', reason: string | null): Promise<boolean>;
  busy(doctorId: string, from: Date, to: Date): Promise<{ startAt: Date; endAt: Date }[]>;
  /** BOOKED → COMPLETED or NO_SHOW once the consultation is over. No-op if no longer BOOKED. */
  finish(id: string, outcome: 'COMPLETED' | 'NO_SHOW'): Promise<void>;
  countBooked(doctorId: string, from: Date, to: Date): Promise<number>;
}

const patientUser = aliasedTable(users, 'patient_user');
const doctorUser = aliasedTable(users, 'doctor_user');

function pgConstraint(err: unknown): string | undefined {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause)
    if ('constraint' in e && typeof e.constraint === 'string') return e.constraint;
  return undefined;
}

/** Whole years between a YYYY-MM-DD birth date and `today`, on the IST calendar. */
export function ageOn(dateOfBirth: string, today: Date): number {
  const [by, bm, bd] = dateOfBirth.split('-').map(Number);
  const t = istParts(today);
  return t.year - by! - (t.month < bm! || (t.month === bm && t.day < bd!) ? 1 : 0);
}

export function createAppointmentRepository(
  db: Database,
  now: () => Date = () => new Date(),
): AppointmentRepository {
  const select = () =>
    db
      .select({
        id: appointments.id,
        status: appointments.status,
        startAt: appointments.startAt,
        endAt: appointments.endAt,
        reasonNote: appointments.reasonNote,
        cancelledBy: appointments.cancelledBy,
        cancelReason: appointments.cancelReason,
        createdAt: appointments.createdAt,
        doctorId: doctorUser.id,
        doctorName: doctorUser.fullName,
        specializations: doctorProfiles.specializations,
        patientId: patientUser.id,
        patientName: patientUser.fullName,
        patientDob: patientProfiles.dateOfBirth,
        consultationId: sql<
          string | null
        >`(SELECT c.id FROM consultations c WHERE c.appointment_id = ${appointments.id})`,
      })
      .from(appointments)
      .innerJoin(doctorUser, eq(doctorUser.id, appointments.doctorId))
      .leftJoin(doctorProfiles, eq(doctorProfiles.userId, appointments.doctorId))
      .innerJoin(patientUser, eq(patientUser.id, appointments.patientId))
      .leftJoin(patientProfiles, eq(patientProfiles.userId, appointments.patientId));

  type Row = Awaited<ReturnType<ReturnType<typeof select>['execute']>>[number];
  const toAppointment = (r: Row): Appointment => ({
    id: r.id,
    status: r.status,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    reasonNote: r.reasonNote,
    doctor: { id: r.doctorId, name: r.doctorName, specializations: r.specializations ?? [] },
    patient: { id: r.patientId, name: r.patientName, age: r.patientDob ? ageOn(r.patientDob, now()) : null },
    cancelledBy: r.cancelledBy,
    cancelReason: r.cancelReason,
    createdAt: r.createdAt.toISOString(),
    consultationId: r.consultationId,
  });

  const ownedBy = (viewer: { id: string; role: Role }): SQL =>
    viewer.role === 'DOCTOR' ? eq(appointments.doctorId, viewer.id) : eq(appointments.patientId, viewer.id);

  return {
    async insert(a) {
      try {
        return await db.transaction(async (tx) => {
          // Racing inserts against two exclusion constraints can deadlock in Postgres (found by
          // the 10-way concurrency test: some requests got a 500 after ~9 s). Taking short
          // transaction locks first, always doctor then patient, makes contenders queue instead;
          // the exclusion constraints below still decide who wins.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(1, hashtext(${a.doctorId}::text))`);
          await tx.execute(sql`SELECT pg_advisory_xact_lock(2, hashtext(${a.patientId}::text))`);
          const [row] = await tx.insert(appointments).values(a).returning({ id: appointments.id });
          return row!;
        });
      } catch (err) {
        const constraint = pgConstraint(err);
        if (constraint === 'appointments_doctor_no_overlap') return 'DOCTOR_BUSY';
        if (constraint === 'appointments_patient_no_overlap') return 'PATIENT_BUSY';
        if (constraint === 'appointments_patient_idempotency_key') return 'DUPLICATE_KEY';
        throw err;
      }
    },

    async findByIdempotencyKey(patientId, key) {
      const [row] = await db
        .select({ id: appointments.id, doctorId: appointments.doctorId, startAt: appointments.startAt })
        .from(appointments)
        .where(and(eq(appointments.patientId, patientId), eq(appointments.idempotencyKey, key)));
      return row ?? null;
    },

    async getFor(id, viewer) {
      const [row] = await select().where(and(eq(appointments.id, id), ownedBy(viewer)));
      return row ? toAppointment(row) : null;
    },

    async list(viewer, scope, now, [dayStart, dayEnd]) {
      const active = and(eq(appointments.status, 'BOOKED'), gt(appointments.endAt, now));
      const where = {
        upcoming: active,
        today: and(
          gte(appointments.startAt, dayStart),
          lt(appointments.startAt, dayEnd),
          ne(appointments.status, 'CANCELLED'),
        ),
        past: or(ne(appointments.status, 'BOOKED'), lte(appointments.endAt, now)),
      }[scope];
      const order = scope === 'past' ? desc(appointments.startAt) : asc(appointments.startAt);
      // ponytail: capped at 100 per list; add paging when someone has more than that
      const rows = await select()
        .where(and(ownedBy(viewer), where))
        .orderBy(order)
        .limit(100);
      return rows.map(toAppointment);
    },

    async cancel(id, by, reason) {
      const rows = await db
        .update(appointments)
        .set({
          status: 'CANCELLED',
          cancelledBy: by,
          cancelReason: reason,
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(appointments.id, id), eq(appointments.status, 'BOOKED')))
        .returning({ id: appointments.id });
      return rows.length === 1;
    },

    async finish(id, outcome) {
      await db
        .update(appointments)
        .set({ status: outcome, updatedAt: new Date() })
        .where(and(eq(appointments.id, id), eq(appointments.status, 'BOOKED')));
    },

    busy: (doctorId, from, to) =>
      db
        .select({ startAt: appointments.startAt, endAt: appointments.endAt })
        .from(appointments)
        .where(
          and(
            eq(appointments.doctorId, doctorId),
            eq(appointments.status, 'BOOKED'),
            lt(appointments.startAt, to),
            gt(appointments.endAt, from),
          ),
        ),

    async countBooked(doctorId, from, to) {
      const [row] = await db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(appointments)
        .where(
          and(
            eq(appointments.doctorId, doctorId),
            eq(appointments.status, 'BOOKED'),
            gte(appointments.startAt, from),
            lt(appointments.startAt, to),
          ),
        );
      return row?.n ?? 0;
    },
  };
}
