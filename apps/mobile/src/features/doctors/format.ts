import type { DoctorCard, DoctorSort } from '@telecare/shared';

export const formatFee = (feeInr: number) => `₹${feeInr.toLocaleString('en-IN')}`;

/** "4.6 ★ (212)", or "New" for a doctor without ratings yet. */
export const formatRating = (d: Pick<DoctorCard, 'ratingAvg' | 'ratingCount'>) =>
  d.ratingAvg === null ? 'New' : `${d.ratingAvg.toFixed(1)} ★ (${d.ratingCount})`;

export const formatExperience = (years: number) => (years === 1 ? '1 year' : `${years} years`);

export const SORT_LABEL: Record<DoctorSort, string> = {
  rating: 'Top rated',
  experience: 'Most experienced',
  fee: 'Lowest fee',
};
