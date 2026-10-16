import { addDays, istDate, istParts } from '@telecare/shared';

const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Formatted by hand on IST, not with the device's locale or timezone:
// a phone or emulator set to another zone must still show Indian times.

/** "3:30 PM" (IST) */
export function formatTime(instant: string | Date): string {
  const { hour, minute } = istParts(instant);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "Today", "Tomorrow" or "Tue 8 Jan" for a YYYY-MM-DD date. */
export function formatDay(date: string, now = new Date()): string {
  const today = istDate(now);
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [, m, d] = date.split('-').map(Number);
  return `${DAYS[istParts(`${date}T12:00:00+05:30`).weekday]} ${d} ${MONTHS[m! - 1]}`;
}

/** "Tomorrow, 3:30 PM" */
export const formatWhen = (instant: string, now = new Date()) =>
  `${formatDay(istDate(instant), now)}, ${formatTime(instant)}`;
