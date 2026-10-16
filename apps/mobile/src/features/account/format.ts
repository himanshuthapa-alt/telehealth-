import type { Gender } from '@telecare/shared';

export const GENDER_LABEL: Record<Gender, string> = {
  FEMALE: 'Female',
  MALE: 'Male',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

/** 'YYYY-MM-DD' → local Date at midnight (no timezone shift). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Local Date → 'YYYY-MM-DD'. */
export function toDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** e.g. "12 Apr 1990" */
export const formatDay = (date: Date) =>
  date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
