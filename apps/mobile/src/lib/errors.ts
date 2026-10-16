import type { ErrorCode } from '@telecare/shared';
import { ApiError } from './api-client';

// The app always shows its own words, never the server's message (blueprint §18).
const COPY: Partial<Record<ErrorCode, string>> = {
  INVALID_CREDENTIALS: 'The phone number or password is wrong.',
  PHONE_TAKEN: 'This phone number already has an account. Try logging in instead.',
  INVALID_RESET_CODE: 'That code is wrong or has expired. Request a new code.',
  RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
  VALIDATION_FAILED: 'Please check the highlighted fields.',
  UNAUTHENTICATED: 'Please log in again to continue.',
  FORBIDDEN: "You don't have access to this.",
  NOT_FOUND: "We couldn't find that.",
  SERVICE_UNAVAILABLE: 'The service is having trouble. Please try again shortly.',
  SLOT_TAKEN: 'This time was just booked by someone else. Please pick another time.',
  SLOT_UNAVAILABLE: 'This time is no longer available. Please pick another time.',
  TIME_CONFLICT: 'You already have an appointment at this time.',
  CANCEL_TOO_LATE: 'It is too close to the start to cancel this appointment.',
  INVALID_STATE: 'This appointment has already been cancelled or finished.',
  CONFLICT: 'Something changed while you were working. Please go back and try again.',
};

/** A sentence to show the user for any failed request. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  const f = err.failure;
  if (f.kind === 'offline') return "You're offline or the server can't be reached. Check your connection.";
  if (f.kind === 'timeout') return 'This is taking too long. Your connection may be slow. Please try again.';
  if (f.code !== 'UNKNOWN' && COPY[f.code]) return COPY[f.code]!;
  if (f.status >= 500) return 'The service is having trouble. Please try again shortly.';
  return 'Something went wrong. Please try again.';
}

/** Per-field messages from a VALIDATION_FAILED response, keyed by field name. */
export function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError && err.failure.kind === 'http' ? (err.failure.fields ?? {}) : {};
}

/** True for 404 and 403: show "We couldn't find this" rather than a retry. */
export function isNotFound(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.failure.kind === 'http' &&
    (err.failure.status === 404 || err.failure.status === 403)
  );
}
