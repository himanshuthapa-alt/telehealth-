import type { Role } from '@telecare/shared';
import type { DbExecutor } from '../../platform/db/client';
import { auditEvents } from './audit.schema';

export type AuditAction =
  | 'AUTH_REGISTERED'
  | 'AUTH_LOGIN_SUCCEEDED'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT'
  | 'AUTH_REFRESH_TOKEN_REUSED'
  | 'AUTH_PASSWORD_RESET_REQUESTED'
  | 'AUTH_PASSWORD_RESET'
  | 'AUTH_PASSWORD_CHANGED'
  | 'ACCESS_DENIED'
  | 'APPOINTMENT_BOOKED'
  | 'APPOINTMENT_CANCELLED'
  | 'CONSULTATION_JOINED'
  | 'CONSULTATION_JOIN_DENIED'
  | 'CONSULTATION_STARTED'
  | 'CONSULTATION_ENDED'
  | 'PRESCRIPTION_ISSUED'
  | 'PRESCRIPTION_VOIDED'
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_CANCELLED'
  | 'DOCTOR_ON_CALL_CHANGED'
  | 'URGENT_REQUEST_CREATED'
  | 'URGENT_REQUEST_ACCEPTED'
  | 'URGENT_REQUEST_DECLINED'
  | 'URGENT_REQUEST_ESCALATED'
  | 'URGENT_REQUEST_CANCELLED';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: Role | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  /** Never health data, passwords, tokens or codes. */
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** Append-only by design: there is no update or delete method (and the DB refuses both). */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}

export function createAuditLog(db: DbExecutor): AuditLog {
  return {
    async record(entry) {
      await db.insert(auditEvents).values(entry);
    },
  };
}
