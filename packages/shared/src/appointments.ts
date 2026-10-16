import type { Specialization } from './profile';

export const APPOINTMENT_STATUSES = ['BOOKED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Booking opens this many days ahead (today counts as day 1). */
export const BOOKING_HORIZON_DAYS = 14;
/** A slot can be booked until this many minutes before it starts. */
export const BOOKING_LEAD_MINUTES = 30;
/** Patients can cancel until this many minutes before the start (blueprint J2). */
export const PATIENT_CANCEL_CUTOFF_MINUTES = 120;
export const SLOT_MINUTES_OPTIONS = [15, 20, 30] as const;
export const REASON_NOTE_MAX = 200;

/** Whether a patient may still cancel. Same rule in the app (to show the button) and the API (to enforce it). */
export function patientCanCancel(
  a: { status: AppointmentStatus; startAt: string },
  now = new Date(),
): boolean {
  return (
    a.status === 'BOOKED' &&
    now.getTime() <= new Date(a.startAt).getTime() - PATIENT_CANCEL_CUTOFF_MINUTES * 60_000
  );
}

export interface Slot {
  startAt: string;
  endAt: string;
}

/** GET /v1/doctors/:id/slots: free slots per IST date. Days without free slots have an empty list. */
export interface SlotsResponse {
  doctorId: string;
  days: { date: string; slots: Slot[] }[];
}

export interface BookAppointmentRequest {
  doctorId: string;
  startAt: string;
  reasonNote?: string;
}

export interface CancelAppointmentRequest {
  /** Required for doctors, optional for patients. */
  reason?: string;
}

/** One appointment, as either party sees it. The patient's phone number is never included. */
export interface Appointment {
  id: string;
  status: AppointmentStatus;
  startAt: string;
  endAt: string;
  reasonNote: string | null;
  doctor: { id: string; name: string; specializations: Specialization[] };
  /** Basics only (blueprint §12): what the doctor needs to prepare. */
  patient: { id: string; name: string; age: number | null };
  cancelledBy: 'PATIENT' | 'DOCTOR' | null;
  cancelReason: string | null;
  createdAt: string;
  /** Set once someone has joined (the consultation exists). */
  consultationId: string | null;
}

export const APPOINTMENT_SCOPES = ['upcoming', 'past', 'today'] as const;
export type AppointmentScope = (typeof APPOINTMENT_SCOPES)[number];

/** A weekly block of consulting hours, in IST. */
export interface AvailabilityRule {
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** "HH:MM" */
  startTime: string;
  endTime: string;
  slotMinutes: number;
}

export interface AvailabilityException {
  /** YYYY-MM-DD, a day with no consultations. */
  date: string;
  reason: string | null;
}

/** GET /v1/availability (doctors, their own). */
export interface Availability {
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
}
