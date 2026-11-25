import type { FulfillmentSource, OrderStatus } from '@telecare/shared';

/**
 * FulfillmentProvider port (blueprint §15, 1mg-ready). The in-house pharmacy
 * queue (orders.service + the pharmacy routes) IS the `local` fulfiller and is
 * unchanged — it is not re-wrapped here. This port is the contract an external
 * delivery partner must meet; `fulfillment.partner.ts` is the stub adapter,
 * selected by `FULFILLMENT_PROVIDER=partner`.
 *
 * Payment stays Cash on Delivery whichever provider runs, and prescription-only
 * medicines still require an issued prescription (enforced in createOrder,
 * provider-agnostic).
 */
export interface FulfillmentProvider {
  readonly name: FulfillmentSource;
  /** Availability + price for the requested items, before an order is placed. */
  checkAvailability(
    items: { medicineId: string; quantity: number }[],
  ): Promise<{ medicineId: string; available: boolean; pricePaise: number }[]>;
  /** Hand the order to the fulfiller; returns its external reference + initial status. */
  placeOrder(orderId: string): Promise<{ externalRef: string | null; status: OrderStatus }>;
  getStatus(orderId: string): Promise<OrderStatus>;
  cancel(orderId: string, reason: string): Promise<void>;
}
