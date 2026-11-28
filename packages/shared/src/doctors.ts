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

/** A self-registered doctor is PENDING until an admin checks their registration number. */
export const DOCTOR_VERIFICATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type DoctorVerificationStatus = (typeof DOCTOR_VERIFICATION_STATUSES)[number];

/** The doctor-editable part of a profile (sign-up and PATCH /v1/me/doctor-profile). */
export interface DoctorProfileFields {
  /** Degrees, e.g. "MBBS, MD (Paediatrics)". Printed on prescriptions (Telemedicine Practice Guidelines 2020). */
  qualification: string;
  specializations: Specialization[];
  languages: Language[];
  experienceYears: number;
  feeInr: number;
  bio: string;
}

/** POST /v1/auth/register/doctor. */
export interface DoctorRegisterRequest extends DoctorProfileFields {
  fullName: string;
  phone: string;
  password: string;
  /** State or National Medical Council registration number. Seen only by the doctor and admins. */
  registrationNumber: string;
  consent: true;
}

/** GET /v1/me/doctor-profile: the doctor's own view, including private fields. */
export interface MyDoctorProfile extends DoctorProfileFields {
  fullName: string;
  registrationNumber: string | null;
  verificationStatus: DoctorVerificationStatus;
  /** Admin's reason, shown to the doctor when REJECTED. */
  verificationNote: string | null;
}

export type UpdateDoctorProfileRequest = Partial<DoctorProfileFields>;

/** GET /v1/me/doctor-stats. Times are IST. */
export interface DoctorStats {
  today: number;
  upcoming: number;
  completed: number;
  /** Completed consultations × current fee. */
  earningsInr: number;
}

/** GET /v1/admin/doctors: what an admin needs to verify a doctor. */
export interface DoctorForReview extends DoctorProfileFields {
  id: string;
  fullName: string;
  phone: string;
  registrationNumber: string | null;
  verificationStatus: DoctorVerificationStatus;
  verificationNote: string | null;
  createdAt: string;
}

/** POST /v1/admin/doctors/:id/verification */
export interface DoctorVerificationRequest {
  status: Exclude<DoctorVerificationStatus, 'PENDING'>;
  /** Required when rejecting, so the doctor knows what to fix. */
  note?: string;
}

/** GET /v1/notifications: the user's own inbox, newest first (50). */
export interface NotificationList {
  unread: number;
  items: {
    id: string;
    title: string;
    body: string;
    /** App route to open when tapped. */
    link: string | null;
    read: boolean;
    createdAt: string;
  }[];
}
