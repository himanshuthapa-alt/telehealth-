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

/** Leading amount in "5 ml", "1/2 tablet", "60 ml bottle", "15 tablets"; null if none. */
export function leadingAmount(text: string | null | undefined): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?/.exec(text ?? '');
  if (!m) return null;
  const value = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
  return value > 0 ? value : null;
}

/**
 * A sensible starting quantity the doctor can change. For a catalog medicine it is in
 * **packs**, because the pharmacy stocks, prices and dispenses packs: 5 ml twice a day for
 * 5 days of a "60 ml bottle" is 1 bottle, not 10. Without a pack size (free-text medicines)
 * it is the number of doses.
 */
export function suggestQuantity(
  frequency: Frequency,
  durationDays: number,
  dosage?: string,
  packSize?: string | null,
): number {
  const perDay = FREQUENCIES[frequency].perDay;
  const doses = perDay === 0 ? 10 : perDay * durationDays;
  const perDose = leadingAmount(dosage);
  const perPack = leadingAmount(packSize);
  // ponytail: assumes dose and pack use the same unit (ml with ml, tablets with tablets); the doctor can override
  return perDose && perPack ? Math.max(1, Math.ceil((doses * perDose) / perPack)) : doses;
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
  /** Catalog price per pack and pack size; null for free-text medicines. `quantity` counts packs. */
  pricePaise: number | null;
  packSize: string | null;
  /** Packs already ordered from this line (cancelled orders don't count). */
  orderedQuantity: number;
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
