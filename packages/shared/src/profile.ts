/** Languages a patient can prefer and a doctor can speak (Phase 4 filters on the same list). */
export const LANGUAGES = [
  'English',
  'Hindi',
  'Bengali',
  'Marathi',
  'Telugu',
  'Tamil',
  'Gujarati',
  'Urdu',
  'Kannada',
  'Odia',
  'Malayalam',
  'Punjabi',
  'Assamese',
] as const;
export type Language = (typeof LANGUAGES)[number];

export const GENDERS = ['FEMALE', 'MALE', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;
export type Gender = (typeof GENDERS)[number];

/** GET /v1/me/profile (patients). Optional fields are null until the patient fills them in. */
export interface PatientProfile {
  fullName: string;
  phone: string;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  gender: Gender | null;
  preferredLanguage: Language | null;
  district: string | null;
  /** ISO timestamp of accepting the privacy notice. */
  consentAt: string | null;
}

/** PATCH /v1/me/profile. Send only what changed; null clears an optional field. */
export interface UpdatePatientProfileRequest {
  fullName?: string;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  preferredLanguage?: Language | null;
  district?: string | null;
}

/** Shortcuts on Home. Phase 4's doctor directory uses the same names. */
export const SPECIALIZATIONS = [
  'General Physician',
  'Pediatrics',
  'Gynecology',
  'Dermatology',
  'Orthopedics',
  'ENT',
  'Cardiology',
  'Psychiatry',
] as const;
export type Specialization = (typeof SPECIALIZATIONS)[number];
