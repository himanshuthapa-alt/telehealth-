import { TRIAGE_DISCLAIMER, type Language, type TriageResult } from '@telecare/shared';
import type { Actor } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import type { AuditLog } from '../audit/audit';
import type { TriageService } from '../triage/triage.service';
import type { UrgentRequestRepository, UrgentRequestRow } from './urgent.repository';

export const URGENT_ESCALATION_AFTER_MS = 3 * 60 * 1000;

export interface UrgentRequestService {
  setOnCall(actor: Actor, isOnCall: boolean, ip?: string): Promise<{ isOnCall: boolean }>;
  onCallStatus(doctorId: string): Promise<{ isOnCall: boolean }>;
  create(
    actor: Actor,
    input: { symptoms: string; language: Language | null },
    idempotencyKey: string,
    ip?: string,
  ): Promise<{ triage: TriageResult; request: UrgentRequestRow | null; reason?: string }>;
  getForPatient(id: string, patientId: string): Promise<UrgentRequestRow>;
  listForPatient(patientId: string): Promise<UrgentRequestRow[]>;
  listForDoctor(doctorId: string): Promise<Array<{ request: UrgentRequestRow; patientName: string }>>;
  accept(id: string, actor: Actor, ip?: string): Promise<UrgentRequestRow>;
  decline(id: string, actor: Actor, ip?: string): Promise<UrgentRequestRow>;
  cancel(id: string, actor: Actor, ip?: string): Promise<UrgentRequestRow>;
  sweep(now?: Date): Promise<number>;
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Urgent request not found');
const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

export function createUrgentRequestService(deps: {
  repo: UrgentRequestRepository;
  triage: TriageService;
  audit: AuditLog;
  now?: () => Date;
}): UrgentRequestService {
  const now = deps.now ?? (() => new Date());

  const recordAdvance = async (row: UrgentRequestRow, action: string, actorId: string | null = null) => {
    await deps.audit.record({
      actorId,
      actorRole: actorId ? 'DOCTOR' : null,
      action: 'URGENT_REQUEST_ESCALATED',
      entityType: 'urgent_request',
      entityId: row.id,
      metadata: { reason: action, status: row.status },
    });
  };

  return {
    async setOnCall(actor, isOnCall, ip) {
      const updated = await deps.repo.setOnCall(actor.id, isOnCall);
      if (!updated) throw notFound();
      await deps.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'DOCTOR_ON_CALL_CHANGED',
        entityType: 'doctor_profile',
        entityId: actor.id,
        metadata: { isOnCall },
        ip,
      });
      if (!isOnCall) {
        const pending = await deps.repo.assignedPendingTo(actor.id);
        for (const request of pending) {
          const next = await deps.repo.advance(request.id, actor.id, now());
          if (next) await recordAdvance(next, 'doctor_went_off_call', actor.id);
        }
      }
      return { isOnCall };
    },
    async onCallStatus(doctorId) {
      return { isOnCall: await deps.repo.isOnCall(doctorId) };
    },
    async create(actor, input, idempotencyKey, ip) {
      const existing = await deps.repo.getByIdempotencyKey(actor.id, idempotencyKey);
      if (existing) {
        return {
          triage: {
            urgency: 'URGENT',
            recommendedSpecialization: existing.recommendedSpecialization,
            summary: `Reported symptoms: ${existing.symptoms}`,
            disclaimer: TRIAGE_DISCLAIMER,
            detectedLanguage: existing.language ?? 'auto',
          },
          request: existing,
        };
      }
      const triage = await deps.triage.triage({
        symptoms: input.symptoms,
        language: input.language ?? undefined,
      });
      if (triage.urgency !== 'URGENT') {
        return {
          triage,
          request: null,
          reason:
            triage.urgency === 'EMERGENCY'
              ? 'Use emergency services now; online requests cannot handle emergencies.'
              : 'The server classified this as routine. Book a regular appointment instead.',
        };
      }

      const candidates = await deps.repo.onCallDoctors(
        triage.recommendedSpecialization,
        undefined,
        input.language,
      );
      if (candidates.length === 0) {
        return {
          triage,
          request: null,
          reason: 'No doctor is currently on call for this specialty. Please book a regular appointment.',
        };
      }

      const created = await deps.repo.create({
        patientId: actor.id,
        symptoms: input.symptoms.slice(0, 1000),
        specialization: triage.recommendedSpecialization,
        language: input.language,
        candidateDoctorIds: candidates.map(({ id }) => id),
        idempotencyKey,
        now: now(),
      });
      await deps.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'URGENT_REQUEST_CREATED',
        entityType: 'urgent_request',
        entityId: created.id,
        metadata: { specialization: created.recommendedSpecialization },
        ip,
      });
      return { triage, request: created };
    },
    async getForPatient(id, patientId) {
      const row = await deps.repo.getForPatient(id, patientId);
      if (!row) throw notFound();
      return row;
    },
    listForPatient(patientId) {
      return deps.repo.listForPatient(patientId);
    },
    listForDoctor(doctorId) {
      return deps.repo.listForDoctor(doctorId);
    },
    async accept(id, actor, ip) {
      const current = await deps.repo.getForDoctor(id, actor.id);
      if (!current) throw notFound();
      if (current.status === 'ACCEPTED') return current;
      if (current.status !== 'PENDING') throw conflict('This request is no longer waiting for a doctor.');
      const accepted = await deps.repo.accept(id, actor.id, now());
      if (!accepted) throw conflict('Another action changed this request. Refresh the inbox.');
      await deps.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'URGENT_REQUEST_ACCEPTED',
        entityType: 'urgent_request',
        entityId: id,
        ip,
      });
      return accepted;
    },
    async decline(id, actor, ip) {
      const current = await deps.repo.getForDoctor(id, actor.id);
      if (!current || current.status !== 'PENDING') throw notFound();
      const updated = await deps.repo.advance(id, actor.id, now());
      if (!updated) throw conflict('Another action changed this request. Refresh the inbox.');
      await deps.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'URGENT_REQUEST_DECLINED',
        entityType: 'urgent_request',
        entityId: id,
        metadata: { status: updated.status },
        ip,
      });
      await recordAdvance(updated, 'doctor_declined', actor.id);
      return updated;
    },
    async cancel(id, actor, ip) {
      const cancelled = await deps.repo.cancel(id, actor.id, now());
      if (!cancelled) throw conflict('Only requests that are still waiting can be cancelled.');
      await deps.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'URGENT_REQUEST_CANCELLED',
        entityType: 'urgent_request',
        entityId: id,
        ip,
      });
      return cancelled;
    },
    async sweep(at = now()) {
      const due = await deps.repo.due(new Date(at.getTime() - URGENT_ESCALATION_AFTER_MS));
      let escalated = 0;
      for (const request of due) {
        if (!request.assignedDoctorId) continue;
        const updated = await deps.repo.advance(request.id, request.assignedDoctorId, at);
        if (!updated) continue;
        await recordAdvance(updated, 'no_accept_within_three_minutes');
        escalated += 1;
      }
      return escalated;
    },
  };
}
