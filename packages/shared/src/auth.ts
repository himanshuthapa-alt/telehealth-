import type { Role } from './roles';

/** The logged-in user as the API returns it. */
export interface AuthUser {
  id: string;
  phone: string;
  fullName: string;
  role: Role;
}

/** Returned by register, login and refresh. */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  /** Seconds until the access token expires. */
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export interface RegisterRequest {
  fullName: string;
  phone: string;
  password: string;
  /** Must be true: the patient accepted the privacy notice. */
  consent: true;
}

export interface LoginRequest {
  phone: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  phone: string;
}

export interface ResetPasswordRequest {
  phone: string;
  code: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX).
 * Accepts spaces, dashes, a leading 0, 91 or +91. Returns null if invalid.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(digits);
  return match ? `+91${match[1]}` : null;
}

export const PASSWORD_MIN_LENGTH = 8;
/** Upper bound so a huge password can't be used to make hashing expensive. */
export const PASSWORD_MAX_LENGTH = 128;

// ponytail: short list of the most common passwords; swap for a larger list if abuse shows up
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '00000000',
  '87654321',
  '12341234',
  'qwerty123',
  'qwertyuiop',
  '1q2w3e4r',
  'abcd1234',
  'iloveyou',
  'welcome1',
  'admin123',
  'letmein1',
  'india123',
  'telecare',
]);

/** Why a password is not allowed, or null if it is fine. Used by both the app and the API. */
export function passwordProblem(password: string, phone?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'This password is too common. Choose another.';
  if (phone && phone.endsWith(password.replace(/\D/g, '')) && /^\d+$/.test(password))
    return "Don't use your phone number as your password.";
  return null;
}
