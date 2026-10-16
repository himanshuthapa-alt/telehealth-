import { describe, expect, it } from 'vitest';
import { addDays, istDate, istInstant, istParts, toHHMM, toMinutes, weekdayOf } from './time';
import { patientCanCancel } from './appointments';

describe('IST time helpers', () => {
  it('converts between UTC instants and the Indian wall clock', () => {
    // 18:45 UTC on 31 Dec is 00:15 IST on 1 Jan: the date and weekday roll over.
    expect(istParts('2026-12-31T18:45:00Z')).toEqual({
      year: 2027,
      month: 1,
      day: 1,
      weekday: 5,
      hour: 0,
      minute: 15,
    });
    expect(istDate('2026-12-31T18:45:00Z')).toBe('2027-01-01');
    expect(istInstant('2027-01-01', 15).toISOString()).toBe('2026-12-31T18:45:00.000Z');
    expect(istInstant('2026-10-05', 10 * 60).toISOString()).toBe('2026-10-05T04:30:00.000Z');
  });

  it('does date arithmetic across month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(weekdayOf('2026-10-05')).toBe(1); // Monday
    expect(weekdayOf('2026-10-11')).toBe(7); // Sunday
    expect(toMinutes('09:30')).toBe(570);
    expect(toHHMM(570)).toBe('09:30');
  });
});

describe('patientCanCancel', () => {
  const start = '2026-10-05T10:00:00Z';
  it('allows cancelling until 2 hours before the start, only while booked', () => {
    expect(patientCanCancel({ status: 'BOOKED', startAt: start }, new Date('2026-10-05T08:00:00Z'))).toBe(
      true,
    );
    expect(patientCanCancel({ status: 'BOOKED', startAt: start }, new Date('2026-10-05T08:00:01Z'))).toBe(
      false,
    );
    expect(patientCanCancel({ status: 'CANCELLED', startAt: start }, new Date('2026-10-01T00:00:00Z'))).toBe(
      false,
    );
  });
});

import { canJoinNow, joinWindow } from './consultation';

describe('join window', () => {
  const a = { status: 'BOOKED' as const, startAt: '2030-01-07T05:00:00Z', endAt: '2030-01-07T05:30:00Z' };
  it('opens 10 minutes before the start and closes 15 minutes after the end', () => {
    expect(joinWindow(a)).toEqual({
      opensAt: new Date('2030-01-07T04:50:00Z'),
      closesAt: new Date('2030-01-07T05:45:00Z'),
    });
    expect(canJoinNow(a, new Date('2030-01-07T04:49:59Z'))).toBe(false);
    expect(canJoinNow(a, new Date('2030-01-07T04:50:00Z'))).toBe(true);
    expect(canJoinNow(a, new Date('2030-01-07T05:44:59Z'))).toBe(true);
    expect(canJoinNow(a, new Date('2030-01-07T05:45:00Z'))).toBe(false);
    expect(canJoinNow({ ...a, status: 'CANCELLED' }, new Date('2030-01-07T05:00:00Z'))).toBe(false);
  });
});

import { isExpired, suggestQuantity } from './prescriptions';

describe('prescription helpers', () => {
  it('suggests one unit per dose for the whole course', () => {
    expect(suggestQuantity('TWICE_A_DAY', 5)).toBe(10);
    expect(suggestQuantity('THREE_TIMES_A_DAY', 7)).toBe(21);
    expect(suggestQuantity('WHEN_NEEDED', 5)).toBe(10);
  });
  it('an issued prescription expires after its last valid day', () => {
    expect(isExpired({ status: 'ISSUED', validUntil: '2030-01-31' }, '2030-01-31')).toBe(false);
    expect(isExpired({ status: 'ISSUED', validUntil: '2030-01-31' }, '2030-02-01')).toBe(true);
    expect(isExpired({ status: 'VOIDED', validUntil: '2030-01-31' }, '2030-02-01')).toBe(false);
  });
});
