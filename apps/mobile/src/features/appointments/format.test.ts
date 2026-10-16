import { formatDay, formatTime, formatWhen } from './format';

describe('IST formatting', () => {
  it('shows Indian times whatever the device timezone', () => {
    expect(formatTime('2030-01-07T04:30:00Z')).toBe('10:00 AM');
    expect(formatTime('2030-01-07T06:30:00Z')).toBe('12:00 PM');
    expect(formatTime('2030-01-07T18:35:00Z')).toBe('12:05 AM'); // already the 8th in India
  });

  it('names nearby days', () => {
    const now = new Date('2030-01-07T02:30:00Z'); // Monday 08:00 IST
    expect(formatDay('2030-01-07', now)).toBe('Today');
    expect(formatDay('2030-01-08', now)).toBe('Tomorrow');
    expect(formatDay('2030-01-10', now)).toBe('Thu 10 Jan');
    expect(formatWhen('2030-01-08T10:00:00Z', now)).toBe('Tomorrow, 3:30 PM');
  });
});
