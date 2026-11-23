import { and, arrayContains, asc, eq, inArray, lte } from 'drizzle-orm';
import type { Language, Specialization } from '@telecare/shared';
import type { Database } from '../../platform/db/client';
import { doctorProfiles } from '../users/doctor-profile.schema';
import { users } from '../users/users.schema';
import { urgentRequests } from './urgent.schema';

export type UrgentRequestRow = typeof urgentRequests.$inferSelect;

export interface UrgentRequestRepository {
  setOnCall(doctorId: string, isOnCall: boolean): Promise<boolean>;
  isOnCall(doctorId: string): Promise<boolean>;
  onCallDoctors(
    specialization: Specialization,
    onlyIds?: string[],
    preferredLanguage?: Language | null,
  ): Promise<{ id: string }[]>;
  create(input: {
    patientId: string;
    symptoms: string;
    specialization: Specialization;
    language: Language | null;
    candidateDoctorIds: string[];
    idempotencyKey: string;
    now: Date;
  }): Promise<UrgentRequestRow>;
  getByIdempotencyKey(patientId: string, idempotencyKey: string): Promise<UrgentRequestRow | null>;
  listForDoctor(doctorId: string): Promise<Array<{ request: UrgentRequestRow; patientName: string }>>;
  listForPatient(patientId: string): Promise<UrgentRequestRow[]>;
  get(id: string): Promise<UrgentRequestRow | null>;
  getForPatient(id: string, patientId: string): Promise<UrgentRequestRow | null>;
  getForDoctor(id: string, doctorId: string): Promise<UrgentRequestRow | null>;
  accept(id: string, doctorId: string, now: Date): Promise<UrgentRequestRow | null>;
  cancel(id: string, patientId: string, now: Date): Promise<UrgentRequestRow | null>;
  advance(id: string, doctorId: string, now: Date): Promise<UrgentRequestRow | null>;
  due(now: Date): Promise<UrgentRequestRow[]>;
  assignedPendingTo(doctorId: string): Promise<UrgentRequestRow[]>;
}

export function createUrgentRequestRepository(db: Database): UrgentRequestRepository {
  return {
    async setOnCall(doctorId, isOnCall) {
      const [row] = await db
        .update(doctorProfiles)
        .set({ isOnCall, updatedAt: new Date() })
        .where(and(eq(doctorProfiles.userId, doctorId), eq(doctorProfiles.isActive, true)))
        .returning({ id: doctorProfiles.userId });
      return !!row;
    },
    async isOnCall(doctorId) {
      const [row] = await db
        .select({ isOnCall: doctorProfiles.isOnCall })
        .from(doctorProfiles)
        .where(and(eq(doctorProfiles.userId, doctorId), eq(doctorProfiles.isActive, true)));
      return row?.isOnCall ?? false;
    },
    async onCallDoctors(specialty, onlyIds, preferredLanguage) {
      const base = and(
        eq(doctorProfiles.isActive, true),
        eq(doctorProfiles.isOnCall, true),
        arrayContains(doctorProfiles.specializations, [specialty]),
        onlyIds ? inArray(doctorProfiles.userId, onlyIds) : undefined,
      );
      const preferredRows = preferredLanguage
        ? await db
            .select({ id: doctorProfiles.userId })
            .from(doctorProfiles)
            .where(and(base, arrayContains(doctorProfiles.languages, [preferredLanguage])))
            .orderBy(asc(doctorProfiles.updatedAt))
        : [];
      const preferredIds = new Set(preferredRows.map(({ id }) => id));
      const rows = await db
        .select({ id: doctorProfiles.userId })
        .from(doctorProfiles)
        .where(base)
        .orderBy(asc(doctorProfiles.updatedAt));
      return [...preferredRows, ...rows.filter(({ id }) => !preferredIds.has(id))];
    },
    async create(input) {
      const [row] = await db
        .insert(urgentRequests)
        .values({
          patientId: input.patientId,
          symptoms: input.symptoms,
          recommendedSpecialization: input.specialization,
          language: input.language,
          candidateDoctorIds: input.candidateDoctorIds,
          candidateIndex: 0,
          idempotencyKey: input.idempotencyKey,
          assignedDoctorId: input.candidateDoctorIds[0] ?? null,
          status: 'PENDING',
          assignedAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing()
        .returning();
      if (row) return row;
      const [existing] = await db
        .select()
        .from(urgentRequests)
        .where(
          and(
            eq(urgentRequests.patientId, input.patientId),
            eq(urgentRequests.idempotencyKey, input.idempotencyKey),
          ),
        );
      return existing!;
    },
    async getByIdempotencyKey(patientId, idempotencyKey) {
      const [row] = await db
        .select()
        .from(urgentRequests)
        .where(
          and(eq(urgentRequests.patientId, patientId), eq(urgentRequests.idempotencyKey, idempotencyKey)),
        );
      return row ?? null;
    },
    async listForDoctor(doctorId) {
      const rows = await db
        .select({ request: urgentRequests, patientName: users.fullName })
        .from(urgentRequests)
        .innerJoin(users, eq(users.id, urgentRequests.patientId))
        .where(and(eq(urgentRequests.assignedDoctorId, doctorId), eq(urgentRequests.status, 'PENDING')))
        .orderBy(asc(urgentRequests.assignedAt));
      return rows;
    },
    listForPatient(patientId) {
      return db
        .select()
        .from(urgentRequests)
        .where(eq(urgentRequests.patientId, patientId))
        .orderBy(asc(urgentRequests.createdAt));
    },
    async get(id) {
      const [row] = await db.select().from(urgentRequests).where(eq(urgentRequests.id, id));
      return row ?? null;
    },
    async getForPatient(id, patientId) {
      const [row] = await db
        .select()
        .from(urgentRequests)
        .where(and(eq(urgentRequests.id, id), eq(urgentRequests.patientId, patientId)));
      return row ?? null;
    },
    async getForDoctor(id, doctorId) {
      const [row] = await db
        .select()
        .from(urgentRequests)
        .where(and(eq(urgentRequests.id, id), eq(urgentRequests.assignedDoctorId, doctorId)));
      return row ?? null;
    },
    async accept(id, doctorId, now) {
      const [row] = await db
        .update(urgentRequests)
        .set({ status: 'ACCEPTED', acceptedAt: now, updatedAt: now })
        .where(
          and(
            eq(urgentRequests.id, id),
            eq(urgentRequests.assignedDoctorId, doctorId),
            eq(urgentRequests.status, 'PENDING'),
          ),
        )
        .returning();
      return row ?? null;
    },
    async cancel(id, patientId, now) {
      const [row] = await db
        .update(urgentRequests)
        .set({ status: 'CANCELLED', assignedDoctorId: null, updatedAt: now })
        .where(
          and(
            eq(urgentRequests.id, id),
            eq(urgentRequests.patientId, patientId),
            eq(urgentRequests.status, 'PENDING'),
          ),
        )
        .returning();
      return row ?? null;
    },
    async advance(id, doctorId, now) {
      const current = await this.getForDoctor(id, doctorId);
      if (!current || current.status !== 'PENDING') return null;
      const available = await this.onCallDoctors(
        current.recommendedSpecialization,
        current.candidateDoctorIds,
      );
      const online = new Set(available.map((doctor) => doctor.id));
      let nextIndex = current.candidateIndex + 1;
      while (
        nextIndex < current.candidateDoctorIds.length &&
        !online.has(current.candidateDoctorIds[nextIndex]!)
      ) {
        nextIndex += 1;
      }
      const nextDoctorId = current.candidateDoctorIds[nextIndex] ?? null;
      const [row] = await db
        .update(urgentRequests)
        .set({
          candidateIndex: nextIndex,
          assignedDoctorId: nextDoctorId,
          assignedAt: now,
          status: nextDoctorId ? 'PENDING' : 'EXHAUSTED',
          updatedAt: now,
        })
        .where(
          and(
            eq(urgentRequests.id, id),
            eq(urgentRequests.assignedDoctorId, doctorId),
            eq(urgentRequests.candidateIndex, current.candidateIndex),
            eq(urgentRequests.status, 'PENDING'),
          ),
        )
        .returning();
      return row ?? null;
    },
    due(now) {
      return db
        .select()
        .from(urgentRequests)
        .where(and(eq(urgentRequests.status, 'PENDING'), lte(urgentRequests.assignedAt, now)))
        .orderBy(asc(urgentRequests.assignedAt));
    },
    assignedPendingTo(doctorId) {
      return db
        .select()
        .from(urgentRequests)
        .where(and(eq(urgentRequests.assignedDoctorId, doctorId), eq(urgentRequests.status, 'PENDING')));
    },
  };
}
