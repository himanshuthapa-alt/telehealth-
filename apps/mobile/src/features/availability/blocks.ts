import type { AvailabilityRule } from '@telecare/shared';

/**
 * The availability editor offers fixed blocks per weekday, which is quick to
 * use on a phone. The API accepts any times.
 * ponytail: preset blocks only; add a custom start/end picker if doctors need other hours
 */
export const BLOCKS = [
  { key: 'morning', label: 'Morning', startTime: '09:00', endTime: '13:00' },
  { key: 'afternoon', label: 'Afternoon', startTime: '14:00', endTime: '17:00' },
  { key: 'evening', label: 'Evening', startTime: '17:00', endTime: '20:00' },
] as const;
export type BlockKey = (typeof BLOCKS)[number]['key'];

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const; // index + 1 = ISO weekday

/** "3:Morning" style keys for chosen (weekday, block) pairs. */
export const cell = (weekday: number, block: BlockKey) => `${weekday}:${block}`;

export function rulesFromBlocks(chosen: ReadonlySet<string>, slotMinutes: number): AvailabilityRule[] {
  return WEEKDAYS.flatMap((_, i) =>
    BLOCKS.filter((b) => chosen.has(cell(i + 1, b.key))).map((b) => ({
      weekday: i + 1,
      startTime: b.startTime,
      endTime: b.endTime,
      slotMinutes,
    })),
  );
}

/** Reads saved rules back into the editor. Rules that aren't one of the blocks come back as `custom`. */
export function blocksFromRules(rules: AvailabilityRule[]) {
  const chosen = new Set<string>();
  const custom: AvailabilityRule[] = [];
  for (const rule of rules) {
    const block = BLOCKS.find((b) => b.startTime === rule.startTime && b.endTime === rule.endTime);
    if (block) chosen.add(cell(rule.weekday, block.key));
    else custom.push(rule);
  }
  return { chosen, custom, slotMinutes: rules[0]?.slotMinutes ?? 15 };
}
