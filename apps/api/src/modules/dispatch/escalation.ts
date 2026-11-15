/**
 * The urgent-paging escalation ladder as a PURE function (project map §6.3),
 * like the blueprint's `canTransition`. The dispatch service calls this on a
 * timer; the decision has no side effects, so it is fully unit-testable.
 */
export interface EscalationConfig {
  /** Wait this long for one doctor to accept before moving on (§6.3: ~3 min). */
  perDoctorTimeoutMs: number;
  /** Try at most this many doctors (§6.3: 3). */
  maxDoctors: number;
  /** Give up overall after this long (§6.3: ~10 min). */
  overallTimeoutMs: number;
}

export const DEFAULT_ESCALATION: EscalationConfig = {
  perDoctorTimeoutMs: 3 * 60_000,
  maxDoctors: 3,
  overallTimeoutMs: 10 * 60_000,
};

export interface EscalationState {
  /** How many doctors have been paged so far. */
  attemptCount: number;
  /** ms since the most recent page was sent (0 if none yet). */
  sinceLastPageMs: number;
  /** ms since the urgent request started. */
  totalElapsedMs: number;
  /** Doctors still available to page. */
  candidatesLeft: number;
  /** A doctor has already accepted. */
  accepted: boolean;
}

export type EscalationAction = 'PAGE_NEXT' | 'WAIT' | 'GIVE_UP';

/** Decide the next move for an urgent page. */
export function nextEscalation(
  state: EscalationState,
  config: EscalationConfig = DEFAULT_ESCALATION,
): EscalationAction {
  if (state.accepted) return 'WAIT';
  // First page.
  if (state.attemptCount === 0) return state.candidatesLeft > 0 ? 'PAGE_NEXT' : 'GIVE_UP';
  // Out of budget or doctors -> stop (caller then advises "call 108" + routine slot).
  if (
    state.totalElapsedMs >= config.overallTimeoutMs ||
    state.attemptCount >= config.maxDoctors ||
    state.candidatesLeft <= 0
  ) {
    return 'GIVE_UP';
  }
  // Still waiting on the current doctor.
  if (state.sinceLastPageMs < config.perDoctorTimeoutMs) return 'WAIT';
  return 'PAGE_NEXT';
}
