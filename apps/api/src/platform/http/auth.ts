import type { RequestHandler, Response } from 'express';
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
export function createAuthGuards(tokens: AccessTokens, audit: AuditLog) {
  const requireAuth: RequestHandler = async (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const actor = header.startsWith('Bearer ') ? await tokens.verify(header.slice(7)) : null;
    if (!actor) return next(new AppError(401, 'UNAUTHENTICATED', 'Log in to continue'));
    res.locals.actor = actor;
    next();
  };

  /** Use after `requireAuth`. Denied attempts are written to the audit log. */
  const requireRole =
    (...roles: Role[]): RequestHandler =>
    async (req, res, next) => {
      const actor = getActor(res);
      if (roles.includes(actor.role)) return next();
      await audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'ACCESS_DENIED',
        metadata: { method: req.method, path: req.path },
        ip: req.ip,
      });
      next(new AppError(403, 'FORBIDDEN', 'You do not have access to this'));
    };

  return { requireAuth, requireRole };
}

export type AuthGuards = ReturnType<typeof createAuthGuards>;

export function getActor(res: Response): Actor {
  const actor = res.locals.actor as Actor | undefined;
  if (!actor) throw new Error('getActor() used on a route without requireAuth');
  return actor;
}
