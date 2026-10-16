import {
  BOOKING_HORIZON_DAYS,
  addDays,
  istDate,
  istInstant,
  type Slot,
  type SlotsResponse,
} from '@telecare/shared';
import type { ScheduleRepository } from './scheduling.repository';
import { freeSlots, type Interval } from './slots';

export interface SlotServiceDeps {
  schedule: ScheduleRepository;
  /** Booked times for a doctor in [from, to). Supplied by the appointments module. */
  busy: (doctorId: string, from: Date, to: Date) => Promise<Interval[]>;
  now: () => Date;
}

/** Turns a doctor's rules into bookable slots. */
export function createSlotService({ schedule, busy, now }: SlotServiceDeps) {
  const today = () => istDate(now());
  const lastBookableDate = () => addDays(today(), BOOKING_HORIZON_DAYS - 1);

  return {
    today,
    lastBookableDate,

    /** Free slots for `days` IST dates starting at `from`. */
    async freeDays(doctorId: string, from: string, days: number): Promise<SlotsResponse['days']> {
      const to = addDays(from, days - 1);
      const { rules, blockedDates } = await schedule.forSlots(doctorId, from, to);
      const booked = await busy(doctorId, istInstant(from, 0), istInstant(addDays(to, 1), 0));
      return freeSlots({ rules, blockedDates, busy: booked, from, days, now: now() });
    },

    /**
     * The slot starting at `startAt`, if it is a real slot of this doctor that
     * can still be booked (inside a rule, not blocked, not too soon, within the
     * horizon). Existing bookings are not checked here: the database's overlap
     * constraint does that atomically at insert time.
     */
    async slotStartingAt(doctorId: string, startAt: Date): Promise<Slot | null> {
      const date = istDate(startAt);
      if (date < today() || date > lastBookableDate()) return null;
      const { rules, blockedDates } = await schedule.forSlots(doctorId, date, date);
      const [day] = freeSlots({ rules, blockedDates, busy: [], from: date, days: 1, now: now() });
      return day!.slots.find((s) => s.startAt === startAt.toISOString()) ?? null;
    },
  };
}

export type SlotService = ReturnType<typeof createSlotService>;
