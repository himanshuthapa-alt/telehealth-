import type { Notify } from '../notifications/notifications';
import {
  PATIENT_CANCEL_CUTOFF_MINUTES,
  addDays,
  istDate,
  istInstant,
  patientCanCancel,
  type Appointment,
  type AppointmentScope,
} from '@telecare/shared';
import type { Actor } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import type { AuditLog } from '../audit/audit';
import type { SlotService } from '../scheduling/slot-service';
import type { AppointmentRepository } from './appointments.repository';

export interface AppointmentServiceDeps {
  repo: AppointmentRepository;
  slots: Pick<SlotService, 'slotStartingAt'>;
  audit: AuditLog;
  now: () => Date;
  /** Inbox messages: new booking to the doctor, cancellation to the other person. */
  notify?: Notify;
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Appointment not found');

/** "Mon 3 Mar, 10:00" in IST, for inbox messages. */
const istLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export function createAppointmentService({
  repo,
  slots,
  audit,
  now,
  notify = async () => undefined,
}: AppointmentServiceDeps) {
  async function load(id: string, actor: Actor) {
    const appointment = await repo.getFor(id, actor);
    if (!appointment) throw notFound(); // not yours looks the same as not there (blueprint §12 rule 3)
    return appointment;
  }

  return {
    /**
     * Books a slot for the patient. Safe to retry: the same idempotency key
     * returns the same appointment instead of booking twice (blueprint §17).
     */
    async book(
      patient: Actor,
      input: { doctorId: string; startAt: Date; reasonNote: string | null; idempotencyKey: string },
      ip?: string,
    ): Promise<{ appointment: Appointment; created: boolean }> {
      const replay = async () => {
        const existing = await repo.findByIdempotencyKey(patient.id, input.idempotencyKey);
        if (!existing) return null;
        if (existing.doctorId !== input.doctorId || existing.startAt.getTime() !== input.startAt.getTime())
          throw new AppError(409, 'CONFLICT', 'This request id was already used for a different booking');
        return { appointment: await load(existing.id, patient), created: false };
      };

      const earlier = await replay();
      if (earlier) return earlier;

      const slot = await slots.slotStartingAt(input.doctorId, input.startAt);
      if (!slot) throw new AppError(409, 'SLOT_UNAVAILABLE', 'This time is not available for booking');

      const result = await repo.insert({
        patientId: patient.id,
        doctorId: input.doctorId,
        startAt: new Date(slot.startAt),
        endAt: new Date(slot.endAt),
        reasonNote: input.reasonNote,
        idempotencyKey: input.idempotencyKey,
      });
      if (result === 'DOCTOR_BUSY')
        throw new AppError(409, 'SLOT_TAKEN', 'This time was just booked by someone else');
      if (result === 'PATIENT_BUSY')
        throw new AppError(409, 'TIME_CONFLICT', 'You already have an appointment at this time');
      if (result === 'DUPLICATE_KEY') return (await replay())!; // the same request raced itself

      await audit.record({
        actorId: patient.id,
        actorRole: patient.role,
        action: 'APPOINTMENT_BOOKED',
        entityType: 'appointment',
        entityId: result.id,
        ip,
      });
      const booked = await load(result.id, patient);
      await notify(input.doctorId, {
        title: 'New booking',
        body: `${booked.patient.name} booked ${istLabel(booked.startAt)}.`,
        link: `/doctor/appointments/${booked.id}`,
      });
      return { appointment: booked, created: true };
    },

    get: load,

    list(actor: Actor, scope: AppointmentScope) {
      const today = istDate(now());
      return repo.list(actor, scope, now(), [istInstant(today, 0), istInstant(addDays(today, 1), 0)]);
    },

    /** Patients: before the cutoff. Doctors: before the start, with a reason (blueprint §12). */
    async cancel(actor: Actor, id: string, reason: string | null, ip?: string): Promise<Appointment> {
      const appointment = await load(id, actor);
      if (appointment.status !== 'BOOKED')
        throw new AppError(409, 'INVALID_STATE', 'This appointment is no longer active');
      if (actor.role === 'PATIENT' && !patientCanCancel(appointment, now()))
        throw new AppError(
          409,
          'CANCEL_TOO_LATE',
          `Appointments can be cancelled up to ${PATIENT_CANCEL_CUTOFF_MINUTES / 60} hours before the start`,
        );
      if (actor.role === 'DOCTOR') {
        if (now() >= new Date(appointment.startAt))
          throw new AppError(409, 'CANCEL_TOO_LATE', 'This appointment has already started');
        if (!reason || reason.length < 3)
          throw new AppError(400, 'VALIDATION_FAILED', 'Give the patient a reason', {
            fields: { reason: 'Tell the patient why' },
          });
      }
      if (!(await repo.cancel(id, actor.role === 'DOCTOR' ? 'DOCTOR' : 'PATIENT', reason)))
        throw new AppError(409, 'INVALID_STATE', 'This appointment is no longer active');
      await audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'APPOINTMENT_CANCELLED',
        entityType: 'appointment',
        entityId: id,
        ip,
      });
      const byDoctor = actor.role === 'DOCTOR';
      await notify(byDoctor ? appointment.patient.id : appointment.doctor.id, {
        title: 'Booking cancelled',
        body: byDoctor
          ? `${appointment.doctor.name} cancelled ${istLabel(appointment.startAt)}: ${reason}`
          : `${appointment.patient.name} cancelled ${istLabel(appointment.startAt)}.`,
        link: byDoctor ? `/patient/appointments/${id}` : `/doctor/appointments/${id}`,
      });
      return load(id, actor);
    },
  };
}

export type AppointmentService = ReturnType<typeof createAppointmentService>;
