import type { OrderStatus } from '@telecare/shared';
import { AppError } from '../../platform/http/errors';
import type { FulfillmentProvider } from './fulfillment';

/**
 * Maps an external partner's status vocabulary onto our order state machine.
 * Unknown strings map to null and are ignored by the sync (never a bad guess).
 * The sync still runs each mapped status through `canTransitionOrder`, so an
 * out-of-order partner event can never force an illegal transition.
 */
const PARTNER_STATUS_MAP: Record<string, OrderStatus> = {
  accepted: 'CONFIRMED',
  confirmed: 'CONFIRMED',
  packed: 'PACKED',
  ready: 'PACKED',
  dispatched: 'SHIPPED',
  shipped: 'SHIPPED',
  out_for_delivery: 'SHIPPED',
  delivered: 'DELIVERED',
  completed: 'DELIVERED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  rejected: 'CANCELLED',
};

export function mapPartnerStatus(raw: string): OrderStatus | null {
  return PARTNER_STATUS_MAP[raw.trim().toLowerCase()] ?? null;
}

/**
 * Partner delivery adapter (stub). Selected by `FULFILLMENT_PROVIDER=partner`.
 * Fails clearly until a partner integration exists — no gateway, no scraping.
 * To make it real, implement these against the partner API (e.g. Tata 1mg) and
 * keep Cash on Delivery as the only payment method.
 */
export function createPartnerFulfillment(): FulfillmentProvider {
  const notConfigured = (): never => {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Delivery partner is not configured');
  };
  return {
    name: 'partner',
    checkAvailability: async () => notConfigured(),
    placeOrder: async () => notConfigured(),
    getStatus: async () => notConfigured(),
    cancel: async () => notConfigured(),
  };
}
