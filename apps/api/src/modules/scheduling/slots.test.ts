import { describe, expect, it } from 'vitest';
import { ageOn } from '../appointments/appointments.repository';
import { freeSlots, rulesOverlap } from './slots';

// 2030-01-07 is a Monday. "now" is far before it unless a test says otherwise.
const MONDAY = '2030-01-07';
const NOW = new Date('2030-01-01T00:00:00Z');
const morning = { weekday: 1, startTime: '10:00', endTime: '11:00', slotMinutes: 20 };
const times = (day: { slots: { startAt: string }[] }) => day.slots.map((s) => s.startAt);

describe('freeSlots', () => {
  it('cuts each rule into slots in IST and leaves out a slot that would run past the end', () => {
    const rule = { ...morning, endTime: '11:10' }; // 10:00, 10:20, 10:40 fit; 11:00 would end at 11:20
    const [day] = freeSlots({
      rules: [rule],
      blockedDates: new Set(),
      busy: [],
      from: MONDAY,
      days: 1,
      now: NOW,
    });
    expect(times(day!)).toEqual([
      '2030-01-07T04:30:00.000Z', // 10:00 IST
      '2030-01-07T04:50:00.000Z',
      '2030-01-07T05:10:00.000Z',
    ]);
    expect(day!.slots[0]!.endAt).toBe('2030-01-07T04:50:00.000Z');
  });

  it('only uses rules for the right weekday, and merges several rules in time order', () => {
    const evening = { weekday: 1, startTime: '17:00', endTime: '17:30', slotMinutes: 30 };
    const tuesday = { weekday: 2, startTime: '09:00', endTime: '10:00', slotMinutes: 30 };
    const days = freeSlots({
      rules: [evening, tuesday, morning],
      blockedDates: new Set(),
      busy: [],
      from: MONDAY,
      days: 2,
      now: NOW,
    });
    expect(days.map((d) => d.date)).toEqual(['2030-01-07', '2030-01-08']);
    expect(days[0]!.slots).toHaveLength(4); // 3 morning + 1 evening
    expect(times(days[0]!).at(-1)).toBe('2030-01-07T11:30:00.000Z'); // 17:00 IST last
    expect(days[1]!.slots).toHaveLength(2);
  });

  it('skips blocked days, booked times and anything less than 30 minutes away', () => {
    const blocked = freeSlots({
      rules: [morning],
      blockedDates: new Set([MONDAY]),
      busy: [],
      from: MONDAY,
      days: 1,
      now: NOW,
    });
    expect(blocked[0]!.slots).toEqual([]);

    const busy = [{ startAt: new Date('2030-01-07T04:40:00Z'), endAt: new Date('2030-01-07T05:00:00Z') }]; // overlaps 10:00 and 10:20
    const withBooking = freeSlots({
      rules: [morning],
      blockedDates: new Set(),
      busy,
      from: MONDAY,
      days: 1,
      now: NOW,
    });
    expect(times(withBooking[0]!)).toEqual(['2030-01-07T05:10:00.000Z']);

    // now = 09:51 IST, so the earliest bookable start is 10:21: 10:00 and 10:20 are too soon, 10:40 is offered.
    const soon = freeSlots({
      rules: [morning],
      blockedDates: new Set(),
      busy: [],
      from: MONDAY,
      days: 1,
      now: new Date('2030-01-07T04:21:00Z'),
    });
    expect(times(soon[0]!)).toEqual(['2030-01-07T05:10:00.000Z']);
  });
});

describe('rulesOverlap', () => {
  it('detects shared time on the same weekday only', () => {
    expect(rulesOverlap(morning, { ...morning, startTime: '10:30', endTime: '12:00' })).toBe(true);
    expect(rulesOverlap(morning, { ...morning, startTime: '11:00', endTime: '12:00' })).toBe(false); // touching is fine
    expect(rulesOverlap(morning, { ...morning, weekday: 2 })).toBe(false);
  });
});

describe('ageOn', () => {
  it('counts a birthday only once it has happened (IST calendar)', () => {
    expect(ageOn('1990-01-07', new Date('2030-01-06T18:30:00Z'))).toBe(40); // 00:00 IST on 7 Jan: birthday
    expect(ageOn('1990-01-07', new Date('2030-01-06T18:29:00Z'))).toBe(39); // 23:59 IST on 6 Jan
    expect(ageOn('2000-02-29', new Date('2030-02-28T12:00:00Z'))).toBe(29);
  });
});
