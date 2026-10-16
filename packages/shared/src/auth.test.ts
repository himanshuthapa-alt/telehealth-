import { describe, expect, it } from 'vitest';
import { normalizePhone, passwordProblem } from './auth';

describe('normalizePhone', () => {
  it('accepts common Indian mobile formats', () => {
    for (const input of ['9876543210', '98765 43210', '+91 98765-43210', '919876543210', '09876543210'])
      expect(normalizePhone(input)).toBe('+919876543210');
  });

  it('rejects landlines, short numbers and other countries', () => {
    for (const input of ['5876543210', '987654321', '+1 9876543210', 'abc', ''])
      expect(normalizePhone(input)).toBeNull();
  });
});

describe('passwordProblem', () => {
  it('accepts a reasonable password', () => {
    expect(passwordProblem('green-mango-42')).toBeNull();
  });

  it('rejects short, huge, common and phone-number passwords', () => {
    expect(passwordProblem('short1')).toMatch(/at least 8/);
    expect(passwordProblem('x'.repeat(129))).toMatch(/at most 128/);
    expect(passwordProblem('Password123')).toMatch(/too common/);
    expect(passwordProblem('9876543210', '+919876543210')).toMatch(/phone number/);
  });
});
