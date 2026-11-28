export const PRESCRIPTION_STATUSES = ['DRAFT', 'ISSUED', 'VOIDED'] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];

export const MEDICINE_FORMS = [
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'INJECTION',
  'OINTMENT',
  'DROPS',
  'INHALER',
  'OTHER',
] as const;
export type MedicineForm = (typeof MEDICINE_FORMS)[number];

/**
 * How often to take it. Fixed choices (not free text), so the patient can be
 * shown morning/afternoon/night pictures and the pharmacy can read it reliably.
 */
export const FREQUENCIES = {
  ONCE_A_DAY: { label: 'Once a day', times: ['morning'], perDay: 1 },
  TWICE_A_DAY: { label: 'Twice a day', times: ['morning', 'night'], perDay: 2 },
  THREE_TIMES_A_DAY: { label: 'Three times a day', times: ['morning', 'afternoon', 'night'], perDay: 3 },
  FOUR_TIMES_A_DAY: {
    label: 'Four times a day',
    times: ['morning', 'afternoon', 'evening', 'night'],
    perDay: 4,
  },
  AT_BEDTIME: { label: 'At bedtime', times: ['night'], perDay: 1 },
  WHEN_NEEDED: { label: 'Only when needed', times: [], perDay: 0 },
} as const;
export type Frequency = keyof typeof FREQUENCIES;
export const FREQUENCY_KEYS = Object.keys(FREQUENCIES) as Frequency[];
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export const PRESCRIPTION_DEFAULT_VALID_DAYS = 30;
/** A doctor can write or change a draft until this long after the consultation ends. */
export const PRESCRIBE_WINDOW_HOURS = 24;

/** A sensible starting quantity: one unit per dose for every dose in the course. The doctor can change it. */
export function suggestQuantity(frequency: Frequency, durationDays: number): number {
  const perDay = FREQUENCIES[frequency].perDay;
  return perDay === 0 ? 10 : perDay * durationDays;
}

/** GET /v1/medicines: what anyone sees in the catalog. Exact stock is the pharmacy's business. */
export interface MedicineSummary {
  id: string;
  name: string;
  genericName: string | null;
  form: MedicineForm;
  strength: string | null;
  packSize: string | null;
  /** Price in paise (₹1 = 100) so money is never a rounded float. */
  pricePaise: number;
  inStock: boolean;
  requiresPrescription: boolean;
  /** Exact units on hand. Pharmacy staff only; patients and doctors only see `inStock`. */
  stockQty?: number;
}

export interface PrescriptionItemInput {
  /** Set when picked from the catalog; null for a medicine the pharmacy doesn't stock. */
  medicineId: string | null;
  medicineName: string;
  /** e.g. "1 tablet", "5 ml" */
  dosage: string;
  frequency: Frequency;
  durationDays: number;
  quantity: number;
  /** e.g. "After food" */
  instructions: string | null;
}

export interface PrescriptionItem extends PrescriptionItemInput {
  id: string;
  /** False when the medicine isn't in the TeleCare+ pharmacy catalog (can't be ordered here). */
  inCatalog: boolean;
}

export interface Prescription {
  id: string;
  consultationId: string;
  status: PrescriptionStatus;
  /** Qualification and registration number are printed on every prescription (Telemedicine Practice Guidelines 2020). */
  doctor: { id: string; name: string; qualification: string | null; registrationNumber: string | null };
  patient: { id: string; name: string; age: number | null };
  items: PrescriptionItem[];
  generalInstructions: string | null;
  /** Days it stays valid after issue (drafts) / the date it ends (issued). */
  validDays: number;
  validUntil: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  /** The prescription this one corrects. */
  supersedesId: string | null;
  createdAt: string;
}

/** PUT /v1/prescriptions/:id (drafts only): the whole content. */
export interface SavePrescriptionRequest {
  items: PrescriptionItemInput[];
  generalInstructions: string | null;
  validDays: number;
}

/** Body of a PRESCRIPTION_CARD chat message. */
export interface PrescriptionCardBody {
  prescriptionId: string;
  itemCount: number;
}

/** An issued prescription past its end date. */
export const isExpired = (p: Pick<Prescription, 'status' | 'validUntil'>, today: string) =>
  p.status === 'ISSUED' && p.validUntil !== null && p.validUntil < today;
