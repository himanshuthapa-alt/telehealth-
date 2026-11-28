export const ROLES = ['PATIENT', 'DOCTOR', 'PHARMACY_ADMIN', 'ADMIN'] as const;

export type Role = (typeof ROLES)[number];
