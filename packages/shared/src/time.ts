/**
 * Times are stored as UTC instants and shown on Indian wall-clock time.
 * IST is UTC+05:30 all year (no daylight saving), so a fixed offset is exact.
 */
export const IST_OFFSET_MINUTES = 330;
const OFFSET_MS = IST_OFFSET_MINUTES * 60_000;

export interface IstParts {
  year: number;
  month: number; // 1–12
  day: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  hour: number;
  minute: number;
}

/** What an Indian wall clock shows at this instant. */
export function istParts(instant: Date | string | number): IstParts {
  const d = new Date(new Date(instant).getTime() + OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay() === 0 ? 7 : d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The IST calendar date of an instant, as YYYY-MM-DD. */
export function istDate(instant: Date | string | number): string {
  const p = istParts(instant);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The instant when an IST wall clock shows `date` at `minutesOfDay` (0–1439). */
export function istInstant(date: string, minutesOfDay: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 0, minutesOfDay) - OFFSET_MS);
}

/** ISO weekday (1 = Monday) of a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** YYYY-MM-DD plus n days. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "HH:MM" ↔ minutes since midnight. */
export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toHHMM = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
