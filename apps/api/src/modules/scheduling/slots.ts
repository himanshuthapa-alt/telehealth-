import {
  BOOKING_LEAD_MINUTES,
  addDays,
  istInstant,
  toMinutes,
  weekdayOf,
  type AvailabilityRule,
  type SlotsResponse,
} from '@telecare/shared';

export interface Interval {
  startAt: Date;
  endAt: Date;
}

export interface SlotInput {
  rules: AvailabilityRule[];
  /** YYYY-MM-DD dates the doctor has blocked. */
  blockedDates: ReadonlySet<string>;
  /** Already-booked times; overlapping slots are left out. */
  busy: Interval[];
  /** First IST date, YYYY-MM-DD. */
  from: string;
  days: number;
  now: Date;
}

/**
 * The free slots per IST date, computed from the weekly rules (blueprint §11
 * "slot generation", done on demand instead of stored). A slot is offered if it
 * fits inside a rule, its day isn't blocked, it starts at least
 * BOOKING_LEAD_MINUTES from now, and it doesn't overlap a booking.
 */
export function freeSlots({ rules, blockedDates, busy, from, days, now }: SlotInput): SlotsResponse['days'] {
  const earliest = now.getTime() + BOOKING_LEAD_MINUTES * 60_000;
  const overlapsBusy = (start: Date, end: Date) => busy.some((b) => start < b.endAt && b.startAt < end);

  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    if (blockedDates.has(date)) return { date, slots: [] };
    const slots = rules
      .filter((rule) => rule.weekday === weekdayOf(date))
      .flatMap((rule) => {
        const out: { startAt: Date; endAt: Date }[] = [];
        for (
          let m = toMinutes(rule.startTime);
          m + rule.slotMinutes <= toMinutes(rule.endTime);
          m += rule.slotMinutes
        )
          out.push({ startAt: istInstant(date, m), endAt: istInstant(date, m + rule.slotMinutes) });
        return out;
      })
      .filter((s) => s.startAt.getTime() >= earliest && !overlapsBusy(s.startAt, s.endAt))
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map((s) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() }));
    return { date, slots };
  });
}

/** True if two rules on the same weekday share any time. */
export function rulesOverlap(a: AvailabilityRule, b: AvailabilityRule): boolean {
  return (
    a.weekday === b.weekday &&
    toMinutes(a.startTime) < toMinutes(b.endTime) &&
    toMinutes(b.startTime) < toMinutes(a.endTime)
  );
}
