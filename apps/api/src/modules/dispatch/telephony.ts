import { randomUUID } from 'node:crypto';

/**
 * Telephony port (project map §8.2): outbound calls/SMS for urgent paging and a
 * masked number pair so doctor and patient never see each other's number
 * (§6.5). Exotel is one implementation; the fake logs and succeeds so the whole
 * urgent lane runs with no telephony account, KYC or DLT registration.
 */
export interface MaskedPair {
  pairId: string;
  virtualNumber: string;
  expiresAt: Date;
}

export interface Telephony {
  readonly name: string;
  call(to: string, message: string): Promise<{ callId: string }>;
  sms(to: string, message: string): Promise<{ messageId: string }>;
  createMaskedPair(input: {
    doctorPhone: string;
    patientPhone: string;
    ttlHours: number;
  }): Promise<MaskedPair>;
  endPair(pairId: string): Promise<void>;
}

/** No real telephony. Everything "succeeds" and is logged (demo/tests). */
export function createFakeTelephony(logger?: {
  info: (msg: string, meta?: Record<string, unknown>) => void;
}): Telephony {
  const log = (action: string, meta: Record<string, unknown>) =>
    logger?.info(`[fake-telephony] ${action}`, meta);
  return {
    name: 'fake',
    call: async (to, message) => {
      log('call', { to, message });
      return { callId: `fake-call-${randomUUID().slice(0, 8)}` };
    },
    sms: async (to, message) => {
      log('sms', { to, message });
      return { messageId: `fake-sms-${randomUUID().slice(0, 8)}` };
    },
    createMaskedPair: async ({ ttlHours }) => {
      log('createMaskedPair', { ttlHours });
      return {
        pairId: `fake-pair-${randomUUID().slice(0, 8)}`,
        virtualNumber: '+91-80000-00000',
        expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
      };
    },
    endPair: async (pairId) => log('endPair', { pairId }),
  };
}

/** TELEPHONY_PROVIDER=none: urgent paging falls back to the in-app doctor inbox. */
export const NO_TELEPHONY = null;
