import { blocksFromRules, cell, rulesFromBlocks } from './blocks';

describe('availability blocks', () => {
  it('turns chosen blocks into weekly rules and back', () => {
    const chosen = new Set([cell(1, 'morning'), cell(1, 'evening'), cell(6, 'morning')]);
    const rules = rulesFromBlocks(chosen, 20);
    expect(rules).toEqual([
      { weekday: 1, startTime: '09:00', endTime: '13:00', slotMinutes: 20 },
      { weekday: 1, startTime: '17:00', endTime: '20:00', slotMinutes: 20 },
      { weekday: 6, startTime: '09:00', endTime: '13:00', slotMinutes: 20 },
    ]);
    const back = blocksFromRules(rules);
    expect([...back.chosen].sort()).toEqual([...chosen].sort());
    expect(back).toMatchObject({ slotMinutes: 20, custom: [] });
  });

  it('keeps hours that are not one of the blocks aside as custom', () => {
    const custom = { weekday: 2, startTime: '10:00', endTime: '12:00', slotMinutes: 15 };
    expect(blocksFromRules([custom]).custom).toEqual([custom]);
  });
});
