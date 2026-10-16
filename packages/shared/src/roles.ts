export const ROLES = ['PATIENT', 'DOCTOR', 'PHARMACY_ADMIN'] as const;

export type Role = (typeof ROLES)[number];
