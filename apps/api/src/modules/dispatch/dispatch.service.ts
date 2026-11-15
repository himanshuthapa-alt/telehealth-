import type { Specialization } from '@telecare/shared';
import type { DispatchRepository } from './dispatch.repository';
import type { Telephony } from './telephony';

export interface PageInput {
  triageResultId: string;
  doctorId: string;
  doctorName: string;
  specialization: Specialization;
  /** One-line AI summary, labelled "not a diagnosis". */
  summary: string;
  attemptNo: number;
}

export interface DispatchServiceDeps {
  repo: DispatchRepository;
  /** null = no telephony: page lands in the doctor's in-app urgent inbox only. */
  telephony: Telephony | null;
  logger?: { info: (msg: string, meta?: Record<string, unknown>) => void };
}

/**
 * Urgent paging (project map §6.3). Sends an on-call doctor an SMS + automated
 * call ("press 1 to accept"); records every page as a dispatch_attempt. The
 * escalation timing is decided by the pure `nextEscalation` ladder.
 */
export function createDispatchService(deps: DispatchServiceDeps) {
  return {
    async page(input: PageInput): Promise<{ attemptId: string; channel: 'CALL' | 'APP' }> {
      const channel: 'CALL' | 'APP' = deps.telephony ? 'CALL' : 'APP';
      const attemptId = await deps.repo.createAttempt({
        triageResultId: input.triageResultId,
        doctorId: input.doctorId,
        channel,
        attemptNo: input.attemptNo,
      });

      if (deps.telephony) {
        const phone = await deps.repo.doctorPhone(input.doctorId);
        if (phone) {
          const msg = `Urgent TeleCare+ patient: ${input.specialization}. AI summary (not a diagnosis): ${input.summary}. Press 1 to accept.`;
          try {
            await deps.telephony.sms(phone, msg);
            await deps.telephony.call(phone, msg);
          } catch (err) {
            await deps.repo.setStatus(attemptId, 'FAILED');
            deps.logger?.info('dispatch page failed, falling back to app inbox', { error: String(err) });
            return { attemptId, channel: 'APP' };
          }
        }
      }
      return { attemptId, channel };
    },

    /** Doctor accepted or declined (IVR keypress or a tap in the doctor app). */
    async respond(attemptId: string, accepted: boolean): Promise<boolean> {
      return deps.repo.setStatus(attemptId, accepted ? 'ACCEPTED' : 'DECLINED');
    },

    attemptsSoFar(triageResultId: string): Promise<number> {
      return deps.repo.countAttempts(triageResultId);
    },
  };
}

export type DispatchService = ReturnType<typeof createDispatchService>;
