import type { Logger } from '../../platform/logger';

/**
 * How a password reset code reaches the user (decision D3: no SMS in the MVP).
 * An SMS provider plugs in here later without changing the auth service.
 */
export interface ResetCodeDelivery {
  send(phone: string, code: string): Promise<void>;
}

/**
 * Development/demo delivery: writes the code to the API log so the team can
 * read it. This is the one deliberate exception to "no secrets in logs";
 * replace it with SMS before any real user relies on reset.
 */
export function createLogResetCodeDelivery(logger: Logger): ResetCodeDelivery {
  return {
    async send(phone, code) {
      logger.warn('password reset code (log delivery, dev/demo only)', {
        phoneLast4: phone.slice(-4),
        code,
      });
    },
  };
}
