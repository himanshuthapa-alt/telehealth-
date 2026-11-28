/**
 * Error codes the API can return. The mobile app maps these codes to
 * user-facing copy; it never displays the server's `message` directly.
 * New modules add their own codes here (e.g. SLOT_TAKEN in Phase 5).
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'INVALID_JSON',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'DOCTOR_NOT_VERIFIED',
  'PRESCRIPTION_REQUIRED',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_CREDENTIALS',
  'PHONE_TAKEN',
  'INVALID_RESET_CODE',
  'SLOT_TAKEN',
  'SLOT_UNAVAILABLE',
  'TIME_CONFLICT',
  'CANCEL_TOO_LATE',
  'INVALID_STATE',
  'JOIN_NOT_OPEN',
  'CONSULTATION_CLOSED',
  'PRESCRIPTION_LOCKED',
  'PRESCRIBE_WINDOW_CLOSED',
  'PRESCRIPTION_NOT_VALID',
  'PRESCRIPTION_EXPIRED',
  'INVALID_PRESCRIPTION_ITEM',
  'QUANTITY_EXCEEDS_PRESCRIPTION',
  'INSUFFICIENT_STOCK',
  'INVALID_TRANSITION',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Body of every non-2xx API response. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (ERROR_CODES as readonly string[]).includes((error as { code: string }).code)
  );
}

/** GET /health */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  checks: {
    database: 'up' | 'down';
  };
}
