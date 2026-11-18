import { describe, expect, it } from 'vitest';
import { canTransitionOrder, generateTrackingId, type OrderStatus } from '@telecare/shared';

describe('Order state machine (Blueprint §15)', () => {
  it('allows valid pharmacy forward transitions', () => {
    expect(canTransitionOrder('PENDING', 'CONFIRMED', 'PHARMACY_ADMIN')).toBe(true);
    expect(canTransitionOrder('CONFIRMED', 'PACKED', 'PHARMACY_ADMIN')).toBe(true);
    expect(canTransitionOrder('PACKED', 'SHIPPED', 'PHARMACY_ADMIN')).toBe(true);
    expect(canTransitionOrder('SHIPPED', 'DELIVERED', 'PHARMACY_ADMIN')).toBe(true);
  });

  it('allows valid pharmacy cancellations before shipping', () => {
    expect(canTransitionOrder('PENDING', 'CANCELLED', 'PHARMACY_ADMIN')).toBe(true);
    expect(canTransitionOrder('CONFIRMED', 'CANCELLED', 'PHARMACY_ADMIN')).toBe(true);
    expect(canTransitionOrder('PACKED', 'CANCELLED', 'PHARMACY_ADMIN')).toBe(true);
  });

  it('refuses cancellation after shipping', () => {
    expect(canTransitionOrder('SHIPPED', 'CANCELLED', 'PHARMACY_ADMIN')).toBe(false);
    expect(canTransitionOrder('SHIPPED', 'CANCELLED', 'PATIENT')).toBe(false);
  });

  it('allows patient to cancel only while PENDING', () => {
    expect(canTransitionOrder('PENDING', 'CANCELLED', 'PATIENT')).toBe(true);
    expect(canTransitionOrder('CONFIRMED', 'CANCELLED', 'PATIENT')).toBe(false);
    expect(canTransitionOrder('PACKED', 'CANCELLED', 'PATIENT')).toBe(false);
  });

  it('refuses patient moving orders forward', () => {
    expect(canTransitionOrder('PENDING', 'CONFIRMED', 'PATIENT')).toBe(false);
    expect(canTransitionOrder('CONFIRMED', 'PACKED', 'PATIENT')).toBe(false);
  });

  it('refuses transitions from terminal states', () => {
    const statuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    for (const s of statuses) {
      expect(canTransitionOrder('DELIVERED', s, 'PHARMACY_ADMIN')).toBe(false);
      expect(canTransitionOrder('CANCELLED', s, 'PHARMACY_ADMIN')).toBe(false);
    }
  });

  it('refuses skipping steps backwards', () => {
    expect(canTransitionOrder('PACKED', 'CONFIRMED', 'PHARMACY_ADMIN')).toBe(false);
    expect(canTransitionOrder('SHIPPED', 'PACKED', 'PHARMACY_ADMIN')).toBe(false);
  });
});

describe('Tracking ID format (Blueprint §14)', () => {
  it('generates TC-XXXX-XXXX Crockford Base32 tracking IDs', () => {
    const id = generateTrackingId();
    expect(id).toMatch(/^TC-[0-9A-HJKMNP-Z]{4}-[0-9A-HJKMNP-Z]{4}$/);
  });

  it('excludes ambiguous characters 0, O, 1, I, L, U', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateTrackingId();
      expect(id).not.toMatch(/[OILU]/);
    }
  });
});
