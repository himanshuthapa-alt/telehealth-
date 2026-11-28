import type { Request, RequestHandler, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { ROLES, type Role } from '@telecare/shared';
import type { AuditLog } from '../../modules/audit/audit';
import { AppError } from './errors';

/** Who is making the request. Set by `requireAuth`. */
export interface Actor {
  id: string;
  role: Role;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Short-lived access tokens: HS256 JWTs carrying only the user id and role. */
export function createAccessTokens(secret: string) {
  const key = new TextEncoder().encode(secret);
  return {
    sign: (actor: Actor) =>
      new SignJWT({ role: actor.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(actor.id)
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
        .sign(key),
    /** The actor, or null if the token is missing, forged, expired or malformed. */
    async verify(token: string): Promise<Actor | null> {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        const role = payload.role as Role;
        return typeof payload.sub === 'string' && ROLES.includes(role) ? { id: payload.sub, role } : null;
      } catch {
        return null;
      }
    },
  };
}

export type AccessTokens = ReturnType<typeof createAccessTokens>;

/**
 * Route guards (blueprint §12, layer 1). They only check "logged in" and
 * "has this role". Ownership checks happen in each service.
 */
/**
 * @param doctorBlocked true if this DOCTOR account must not act as a doctor yet
 *   (self-registered and not, or no longer, approved by an admin).
 */
export function createAuthGuards(
  tokens: AccessTokens,
  audit: AuditLog,
  doctorBlocked: (doctorId: string) => Promise<boolean> = async () => false,
) {
  /** Sets res.locals.actor from the Bearer token; false if missing or invalid. */
  async function authenticate(req: Request, res: Response): Promise<boolean> {
    if (res.locals.actor) return true;
    const header = req.get('authorization') ?? '';
    const actor = header.startsWith('Bearer ') ? await tokens.verify(header.slice(7)) : null;
    if (actor) res.locals.actor = actor;
    return !!actor;
  }

  const requireAuth: RequestHandler = async (req, res, next) =>
    (await authenticate(req, res))
      ? next()
      : next(new AppError(401, 'UNAUTHENTICATED', 'Log in to continue'));

  /**
   * Use after `requireAuth`. Denied attempts are written to the audit log.
   * Doctors must also be verified, checked on every request so removing approval takes effect at once.
   */
  const requireRole =
    (...roles: Role[]): RequestHandler =>
    async (req, res, next) => {
      // Authenticates too, so a route that lists only requireRole can never run unauthenticated.
      if (!(await authenticate(req, res)))
        return next(new AppError(401, 'UNAUTHENTICATED', 'Log in to continue'));
      const actor = getActor(res);
      if (roles.includes(actor.role)) {
        if (actor.role !== 'DOCTOR' || !(await doctorBlocked(actor.id))) return next();
        return next(new AppError(403, 'DOCTOR_NOT_VERIFIED', 'Your doctor account is awaiting approval'));
      }
      await audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'ACCESS_DENIED',
        metadata: { method: req.method, path: req.path },
        ip: req.ip,
      });
      next(new AppError(403, 'FORBIDDEN', 'You do not have access to this'));
    };

  /** A doctor's own account, approved or not: for reading/editing their profile while they wait. */
  const requireDoctorAccount: RequestHandler = (req, res, next) =>
    getActor(res).role === 'DOCTOR'
      ? next()
      : next(new AppError(403, 'FORBIDDEN', 'You do not have access to this'));

  return { requireAuth, requireRole, requireDoctorAccount };
}

export type AuthGuards = ReturnType<typeof createAuthGuards>;

export function getActor(res: Response): Actor {
  const actor = res.locals.actor as Actor | undefined;
  if (!actor) throw new Error('getActor() used on a route without requireAuth');
  return actor;
}
