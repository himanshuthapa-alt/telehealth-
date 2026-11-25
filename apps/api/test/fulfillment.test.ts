import { describe, expect, it } from 'vitest';
import { createPartnerFulfillment, mapPartnerStatus } from '../src/modules/orders/fulfillment.partner';

describe('mapPartnerStatus', () => {
  it('maps partner vocabulary onto our order statuses (case/space-insensitive)', () => {
    expect(mapPartnerStatus('accepted')).toBe('CONFIRMED');
    expect(mapPartnerStatus('  Out_For_Delivery ')).toBe('SHIPPED');
    expect(mapPartnerStatus('DELIVERED')).toBe('DELIVERED');
    expect(mapPartnerStatus('rejected')).toBe('CANCELLED');
  });

  it('returns null for an unknown status (never a bad guess)', () => {
    expect(mapPartnerStatus('on_the_moon')).toBeNull();
    expect(mapPartnerStatus('')).toBeNull();
  });
});

describe('Partner fulfillment (stub)', () => {
  const partner = createPartnerFulfillment();

  it('fails clearly until credentials exist', async () => {
    await expect(partner.checkAvailability([])).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
    await expect(partner.placeOrder('o1')).rejects.toMatchObject({ status: 503 });
    await expect(partner.getStatus('o1')).rejects.toMatchObject({ status: 503 });
    await expect(partner.cancel('o1', 'x')).rejects.toMatchObject({ status: 503 });
  });
});
