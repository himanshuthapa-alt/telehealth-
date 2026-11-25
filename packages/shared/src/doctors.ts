import type { Language, Specialization } from './profile';

export const DOCTOR_SORTS = ['rating', 'experience', 'fee'] as const;
export type DoctorSort = (typeof DOCTOR_SORTS)[number];

/** Minimum-rating filter choices offered in the app. */
export const MIN_RATING_OPTIONS = [3.5, 4, 4.5] as const;

export const DOCTOR_PAGE_SIZE = 20;

export const DOCTOR_AVAILABILITY_FILTERS = ['today', 'week'] as const;
export type DoctorAvailabilityFilter = (typeof DOCTOR_AVAILABILITY_FILTERS)[number];

/** Where a doctor (and any booking made with them) comes from. */
export const DOCTOR_SOURCES = ['local', 'practo'] as const;
export type DoctorSource = (typeof DOCTOR_SOURCES)[number];

/** One result in the doctor list: only what a card shows (small payloads, blueprint §17). */
export interface DoctorCard {
  id: string;
  name: string;
  specializations: Specialization[];
  languages: Language[];
  experienceYears: number;
  /** Consultation fee in whole rupees. */
  feeInr: number;
  /** Null until the doctor has ratings. */
  ratingAvg: number | null;
  ratingCount: number;
  photoUrl: string | null;
  /** Seeded demo data, shown with a DEMO label. */
  isDemo: boolean;
  /** Which directory this doctor came from, so the app can show where a booking goes. */
  source: DoctorSource;
}

/** GET /v1/doctors/:id. Never includes the registration number or other private fields. */
export interface DoctorDetail extends DoctorCard {
  bio: string;
}

/** GET /v1/doctors query string. All optional. */
export interface DoctorSearchParams {
  /** Matches doctor name or specialization. */
  q?: string;
  specialization?: Specialization;
  language?: Language;
  minRating?: number;
  sort?: DoctorSort;
  /** Only doctors with consulting hours today (still to come) or in the next 7 days. */
  available?: DoctorAvailabilityFilter;
  /** 1-based. */
  page?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
