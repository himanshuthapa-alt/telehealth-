import type { Notify } from '../notifications/notifications';
import {
  PRESCRIBE_WINDOW_HOURS,
  addDays,
  istDate,
  type Prescription,
  type PrescriptionCardBody,
  type SavePrescriptionRequest,
} from '@telecare/shared';
import type { Actor } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import type { AuditLog } from '../audit/audit';
import type { ConsultationService } from '../consultations/consultations.service';
import type { MedicineCatalog } from '../pharmacy/medicines.repository';
import type { PrescriptionRepository, PrescriptionRow } from './prescriptions.repository';

export interface PrescriptionServiceDeps {
  repo: PrescriptionRepository;
  consultations: Pick<ConsultationService, 'participant' | 'post'>;
  catalog: MedicineCatalog;
  audit: AuditLog;
  now: () => Date;
  /** Inbox message to the patient when a prescription is issued. */
  notify?: Notify;
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Prescription not found');
const locked = () =>
  new AppError(
    409,
    'PRESCRIPTION_LOCKED',
    'An issued prescription cannot be changed. Void it and write a new one.',
  );

export function createPrescriptionService({
  repo,
  consultations,
  catalog,
  audit,
  now,
  notify = async () => undefined,
}: PrescriptionServiceDeps) {
  /** Doctors write during the consultation or up to 24 h after it ends (blueprint §12). */
  async function prescribableConsultation(doctor: Actor, consultationId: string) {
    if (doctor.role !== 'DOCTOR')
      throw new AppError(403, 'FORBIDDEN', 'Only the doctor can write a prescription');
    const { c, a } = await consultations.participant(doctor, consultationId);
    const open =
      c.status === 'ACTIVE' ||
      (c.status === 'COMPLETED' &&
        c.endedAt !== null &&
        now().getTime() < c.endedAt.getTime() + PRESCRIBE_WINDOW_HOURS * 3_600_000);
    if (!open)
      throw new AppError(
        409,
        'PRESCRIBE_WINDOW_CLOSED',
        `Prescriptions can be written during the consultation and up to ${PRESCRIBE_WINDOW_HOURS} hours after it`,
      );
    return { c, a };
  }

  /** A prescription the doctor wrote; anyone else's looks like it doesn't exist. */
  async function ownRow(doctor: Actor, id: string): Promise<PrescriptionRow> {
    const row = await repo.row(id);
    if (!row || doctor.role !== 'DOCTOR' || row.doctorId !== doctor.id) throw notFound();
    return row;
  }

  const view = async (id: string) => (await repo.view(id))!;

  return {
    /** Opens (or returns) the draft for a consultation. */
    async draft(doctor: Actor, consultationId: string): Promise<Prescription> {
      const { a } = await prescribableConsultation(doctor, consultationId);
      return view(await repo.draftFor({ consultationId, doctorId: a.doctor.id, patientId: a.patient.id }));
    },

    async save(doctor: Actor, id: string, input: SavePrescriptionRequest): Promise<Prescription> {
      const row = await ownRow(doctor, id);
      if (row.status !== 'DRAFT') throw locked();
      await prescribableConsultation(doctor, row.consultationId);
      const ids = input.items.map((i) => i.medicineId).filter((m): m is string => m !== null);
      const known = await catalog.existing(ids);
      const unknown = ids.find((m) => !known.has(m));
      if (unknown)
        throw new AppError(400, 'VALIDATION_FAILED', 'Unknown medicine', {
          fields: { items: 'A medicine is no longer in the catalog' },
        });
      await repo.save(id, input);
      return view(id);
    },

    /** Locks it, posts it into the consultation chat as a card (blueprint §13.3). */
    async issue(doctor: Actor, id: string, ip?: string): Promise<Prescription> {
      const row = await ownRow(doctor, id);
      if (row.status !== 'DRAFT') throw locked();
      await prescribableConsultation(doctor, row.consultationId);
      const items = await repo.itemsOf(id);
      if (items.length === 0)
        throw new AppError(400, 'VALIDATION_FAILED', 'Add at least one medicine', {
          fields: { items: 'Add at least one medicine' },
        });

      const result = await repo.issue(id, now(), addDays(istDate(now()), row.validDays));
      if (result === 'ALREADY_ISSUED')
        throw new AppError(
          409,
          'INVALID_STATE',
          'This consultation already has a prescription. Void it first to replace it.',
        );
      if (result === 'NOT_DRAFT') throw locked();

      const card: PrescriptionCardBody = { prescriptionId: id, itemCount: items.length };
      await consultations.post(row.consultationId, 'PRESCRIPTION_CARD', JSON.stringify(card));
      await audit.record({
        actorId: doctor.id,
        actorRole: doctor.role,
        action: 'PRESCRIPTION_ISSUED',
        entityType: 'prescription',
        entityId: id,
        ip,
      });
      await notify(row.patientId, {
        title: 'Your prescription is ready',
        body: 'Open it to see your medicines, or order them for delivery.',
        link: `/patient/medicines/prescription/${id}`,
      });
      return view(id);
    },

    /**
     * Withdraws an issued prescription with a reason. With `revise`, also opens a
     * new draft that copies it and points back to it (blueprint §11: void + supersede).
     */
    async void(
      doctor: Actor,
      id: string,
      reason: string,
      revise: boolean,
      ip?: string,
    ): Promise<{ voided: Prescription; draft: Prescription | null }> {
      const row = await ownRow(doctor, id);
      if (row.status !== 'ISSUED')
        throw new AppError(409, 'INVALID_STATE', 'Only an issued prescription can be voided');
      if (revise) await prescribableConsultation(doctor, row.consultationId);
      if (!(await repo.voidIt(id, reason, now())))
        throw new AppError(409, 'INVALID_STATE', 'This prescription was already voided');
      await consultations.post(row.consultationId, 'SYSTEM', `The doctor withdrew a prescription: ${reason}`);
      await audit.record({
        actorId: doctor.id,
        actorRole: doctor.role,
        action: 'PRESCRIPTION_VOIDED',
        entityType: 'prescription',
        entityId: id,
        ip,
      });

      let draft: Prescription | null = null;
      if (revise) {
        const draftId = await repo.draftFor({
          consultationId: row.consultationId,
          doctorId: row.doctorId,
          patientId: row.patientId,
          supersedesId: id,
        });
        await repo.save(draftId, {
          items: await repo.itemsOf(id),
          generalInstructions: row.generalInstructions,
          validDays: row.validDays,
        });
        draft = await view(draftId);
      }
      return { voided: await view(id), draft };
    },

    /** Patients see their issued/voided prescriptions (never drafts); doctors see what they wrote. */
    async get(actor: Actor, id: string): Promise<Prescription> {
      const p = await repo.view(id);
      const allowed =
        p &&
        ((actor.role === 'DOCTOR' && p.doctor.id === actor.id) ||
          (actor.role === 'PATIENT' && p.patient.id === actor.id && p.status !== 'DRAFT'));
      if (!allowed) throw notFound();
      return p;
    },

    list(actor: Actor) {
      return actor.role === 'DOCTOR'
        ? repo.list({ doctorId: actor.id, includeDrafts: true })
        : repo.list({ patientId: actor.id, includeDrafts: false });
    },

    async forConsultation(actor: Actor, consultationId: string) {
      await consultations.participant(actor, consultationId);
      return repo.list({ consultationId, includeDrafts: actor.role === 'DOCTOR' });
    },
  };
}

export type PrescriptionService = ReturnType<typeof createPrescriptionService>;
