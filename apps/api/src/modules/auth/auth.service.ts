import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  passwordProblem,
  type AuthSession,
  type AuthUser,
  type DoctorRegisterRequest,
} from '@telecare/shared';
import { AppError } from '../../platform/http/errors';
import { ACCESS_TOKEN_TTL_SECONDS, type AccessTokens, type Actor } from '../../platform/http/auth';
import type { AuditLog } from '../audit/audit';
import type { DoctorProfileRepository } from '../users/doctor-profile.repository';
import type { UserRecord, UsersRepository } from '../users/users.repository';
import type { RefreshTokenRepository, ResetCodeRepository } from './auth.repository';
import { DUMMY_HASH, hashPassword, verifyPassword } from './passwords';
import type { ResetCodeDelivery } from './reset-code-delivery';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
export const RESET_CODE_MAX_ATTEMPTS = 5;

export interface AuthRepos {
  users: UsersRepository;
  refreshTokens: RefreshTokenRepository;
  resetCodes: ResetCodeRepository;
  audit: AuditLog;
  doctorProfiles: DoctorProfileRepository;
}

/** Runs `work` in one database transaction, with repositories bound to it. */
export type InTransaction = <T>(work: (repos: AuthRepos) => Promise<T>) => Promise<T>;

export interface AuthServiceDeps {
  repos: AuthRepos;
  inTransaction: InTransaction;
  accessTokens: AccessTokens;
  resetCodeDelivery: ResetCodeDelivery;
}

/** Request facts the service records in the audit log. */
export interface RequestInfo {
  ip?: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Phone number or password is wrong');
const sessionEnded = () => new AppError(401, 'UNAUTHENTICATED', 'Your session has ended. Log in again.');
const invalidResetCode = () => new AppError(400, 'INVALID_RESET_CODE', 'The code is wrong or has expired');

function assertPasswordAllowed(password: string, phone: string, field: string) {
  const problem = passwordProblem(password, phone);
  if (problem) throw new AppError(400, 'VALIDATION_FAILED', problem, { fields: { [field]: problem } });
}

const toAuthUser = ({ id, phone, fullName, role }: UserRecord): AuthUser => ({ id, phone, fullName, role });

export function createAuthService({
  repos,
  inTransaction,
  accessTokens,
  resetCodeDelivery,
}: AuthServiceDeps) {
  async function issueSession(tx: AuthRepos, user: UserRecord): Promise<AuthSession> {
    const refreshToken = randomBytes(32).toString('base64url');
    await tx.refreshTokens.create({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    return {
      user: toAuthUser(user),
      accessToken: await accessTokens.sign({ id: user.id, role: user.role }),
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
    };
  }

  async function createAccount(
    input: { fullName: string; phone: string; password: string; role: 'PATIENT' | 'DOCTOR' },
    req: RequestInfo,
    afterCreate?: (tx: AuthRepos, user: UserRecord) => Promise<void>,
  ): Promise<AuthSession> {
    assertPasswordAllowed(input.password, input.phone, 'password');
    const passwordHash = await hashPassword(input.password);
    return inTransaction(async (tx) => {
      const user = await tx.users.create({
        phone: input.phone,
        fullName: input.fullName,
        role: input.role,
        passwordHash,
        consentAt: new Date(),
      });
      if (!user) throw new AppError(409, 'PHONE_TAKEN', 'This phone number is already registered');
      await afterCreate?.(tx, user);
      await tx.audit.record({
        actorId: user.id,
        actorRole: user.role,
        action: 'AUTH_REGISTERED',
        ip: req.ip,
      });
      return issueSession(tx, user);
    });
  }

  return {
    /** Patient self-registration. Pharmacy staff and admins are provisioned (§12). */
    register(input: { fullName: string; phone: string; password: string }, req: RequestInfo) {
      return createAccount({ ...input, role: 'PATIENT' }, req);
    },

    /** Doctor self-registration. The profile stays PENDING (not listed) until an admin approves it. */
    registerDoctor(
      { fullName, phone, password, ...profile }: Omit<DoctorRegisterRequest, 'consent'>,
      req: RequestInfo,
    ) {
      return createAccount({ fullName, phone, password, role: 'DOCTOR' }, req, (tx, user) =>
        tx.doctorProfiles.createPending(user.id, profile),
      );
    },

    async login(input: { phone: string; password: string }, req: RequestInfo): Promise<AuthSession> {
      const user = await repos.users.findByPhone(input.phone);
      // Always run one hash check, so an unknown phone takes as long as a wrong password.
      const ok = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, input.password);
      if (!user || !ok) {
        await repos.audit.record({
          actorId: user?.id,
          actorRole: user?.role,
          action: 'AUTH_LOGIN_FAILED',
          metadata: { reason: user ? 'wrong_password' : 'unknown_phone' },
          ip: req.ip,
        });
        throw invalidCredentials();
      }
      return inTransaction(async (tx) => {
        await tx.audit.record({
          actorId: user.id,
          actorRole: user.role,
          action: 'AUTH_LOGIN_SUCCEEDED',
          ip: req.ip,
        });
        return issueSession(tx, user);
      });
    },

    /**
     * Rotates a refresh token: the old one is revoked and a new pair issued.
     * Presenting an already-rotated token means it was copied or stolen, so
     * every session of that user is ended (blueprint §16). A token revoked by
     * logout or a password change is just refused.
     */
    async refresh(refreshToken: string, req: RequestInfo): Promise<AuthSession> {
      const tokenHash = sha256(refreshToken);
      return inTransaction(async (tx) => {
        const consumed = await tx.refreshTokens.rotate(tokenHash);
        if (consumed) {
          const user = await tx.users.findById(consumed.userId);
          if (!user) throw sessionEnded();
          return issueSession(tx, user);
        }
        const reusedBy = await tx.refreshTokens.findRotatedOwner(tokenHash);
        if (reusedBy) {
          await tx.refreshTokens.revokeAllForUser(reusedBy);
          await tx.audit.record({ actorId: reusedBy, action: 'AUTH_REFRESH_TOKEN_REUSED', ip: req.ip });
        }
        return null;
      }).then((session) => session ?? Promise.reject(sessionEnded()));
    },

    /** Always succeeds, so logout works even with an already-expired token. */
    async logout(refreshToken: string, req: RequestInfo): Promise<void> {
      const revoked = await repos.refreshTokens.revoke(sha256(refreshToken));
      if (revoked) await repos.audit.record({ actorId: revoked.userId, action: 'AUTH_LOGOUT', ip: req.ip });
    },

    /** Same response whether or not the phone has an account (no account enumeration). */
    async forgotPassword(phone: string, req: RequestInfo): Promise<void> {
      const user = await repos.users.findByPhone(phone);
      if (!user) return;
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      await repos.resetCodes.replace({
        userId: user.id,
        codeHash: sha256(`${user.id}:${code}`),
        expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
      });
      await repos.audit.record({
        actorId: user.id,
        actorRole: user.role,
        action: 'AUTH_PASSWORD_RESET_REQUESTED',
        ip: req.ip,
      });
      await resetCodeDelivery.send(user.phone, code);
    },

    /** Sets a new password with a reset code, and ends every existing session. */
    async resetPassword(
      input: { phone: string; code: string; newPassword: string },
      req: RequestInfo,
    ): Promise<void> {
      assertPasswordAllowed(input.newPassword, input.phone, 'newPassword');
      const user = await repos.users.findByPhone(input.phone);
      if (!user) throw invalidResetCode();
      const active = await repos.resetCodes.findActive(user.id, RESET_CODE_MAX_ATTEMPTS);
      if (!active) throw invalidResetCode();
      const given = Buffer.from(sha256(`${user.id}:${input.code}`));
      if (!timingSafeEqual(given, Buffer.from(active.codeHash))) {
        await repos.resetCodes.recordFailedAttempt(active.id);
        throw invalidResetCode();
      }
      const passwordHash = await hashPassword(input.newPassword);
      await inTransaction(async (tx) => {
        if (!(await tx.resetCodes.markUsed(active.id))) throw invalidResetCode();
        await tx.users.updatePassword(user.id, passwordHash);
        await tx.refreshTokens.revokeAllForUser(user.id);
        await tx.audit.record({
          actorId: user.id,
          actorRole: user.role,
          action: 'AUTH_PASSWORD_RESET',
          ip: req.ip,
        });
      });
    },

    /** Changes the password of the logged-in user, ends all other sessions and returns a fresh one. */
    async changePassword(
      actor: Actor,
      input: { currentPassword: string; newPassword: string },
      req: RequestInfo,
    ): Promise<AuthSession> {
      const user = await repos.users.findById(actor.id);
      if (!user) throw sessionEnded();
      if (!(await verifyPassword(user.passwordHash, input.currentPassword)))
        // 400, not 401: the session is fine, only the typed password is wrong.
        throw new AppError(400, 'INVALID_CREDENTIALS', 'Current password is wrong', {
          fields: { currentPassword: 'Current password is wrong' },
        });
      assertPasswordAllowed(input.newPassword, user.phone, 'newPassword');
      const passwordHash = await hashPassword(input.newPassword);
      return inTransaction(async (tx) => {
        await tx.users.updatePassword(user.id, passwordHash);
        await tx.refreshTokens.revokeAllForUser(user.id);
        await tx.audit.record({
          actorId: user.id,
          actorRole: user.role,
          action: 'AUTH_PASSWORD_CHANGED',
          ip: req.ip,
        });
        return issueSession(tx, user);
      });
    },

    async me(actor: Actor): Promise<AuthUser> {
      const user = await repos.users.findById(actor.id);
      if (!user) throw sessionEnded();
      return toAuthUser(user);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
