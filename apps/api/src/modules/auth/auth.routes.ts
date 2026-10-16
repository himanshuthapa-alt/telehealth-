import { Router, type Request } from 'express';
import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, normalizePhone } from '@telecare/shared';
import { getActor, type AuthGuards } from '../../platform/http/auth';
import { createRateLimiter } from '../../platform/http/rate-limit';
import { parseBody } from '../../platform/http/validate';
import type { AuthService } from './auth.service';

const phone = z
  .string()
  .max(20)
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number' });
    return normalized ?? z.NEVER;
  });
// Only the length cap here; the password policy is checked in the service.
const password = z.string().min(1, 'Enter your password').max(PASSWORD_MAX_LENGTH);
const refreshToken = z.string().min(1).max(200);

const RegisterBody = z.strictObject({
  fullName: z.string().trim().min(2, 'Enter your full name').max(100),
  phone,
  password,
  consent: z.literal(true, 'Please accept the privacy notice to continue'),
});
const LoginBody = z.strictObject({ phone, password });
const RefreshBody = z.strictObject({ refreshToken });
const ForgotBody = z.strictObject({ phone });
const ResetBody = z.strictObject({
  phone,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: password,
});
const ChangeBody = z.strictObject({ currentPassword: password, newPassword: password });

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export function authRoutes(service: AuthService, guards: AuthGuards): Router {
  const router = Router();
  const perIp = createRateLimiter({ max: 100, windowMs: FIFTEEN_MINUTES });
  const loginsPerPhone = createRateLimiter({ max: 5, windowMs: FIFTEEN_MINUTES });
  const resetRequestsPerPhone = createRateLimiter({ max: 3, windowMs: 60 * 60 * 1000 });
  const info = (req: Request) => ({ ip: req.ip });

  router.use('/v1/auth', (req, _res, next) => {
    perIp.hit(req.ip ?? 'unknown');
    next();
  });

  router.post('/v1/auth/register', async (req, res) => {
    const body = parseBody(RegisterBody, req);
    res.status(201).json(await service.register(body, info(req)));
  });

  router.post('/v1/auth/login', async (req, res) => {
    const body = parseBody(LoginBody, req);
    loginsPerPhone.hit(body.phone); // counted before checking, so parallel guesses are limited too
    const session = await service.login(body, info(req));
    loginsPerPhone.reset(body.phone);
    res.json(session);
  });

  router.post('/v1/auth/refresh', async (req, res) => {
    const body = parseBody(RefreshBody, req);
    res.json(await service.refresh(body.refreshToken, info(req)));
  });

  router.post('/v1/auth/logout', async (req, res) => {
    const body = parseBody(RefreshBody, req);
    await service.logout(body.refreshToken, info(req));
    res.status(204).end();
  });

  router.post('/v1/auth/password/forgot', async (req, res) => {
    const body = parseBody(ForgotBody, req);
    resetRequestsPerPhone.hit(body.phone);
    await service.forgotPassword(body.phone, info(req));
    res.status(202).end();
  });

  router.post('/v1/auth/password/reset', async (req, res) => {
    const body = parseBody(ResetBody, req);
    await service.resetPassword(body, info(req));
    res.status(204).end();
  });

  router.post('/v1/auth/password/change', guards.requireAuth, async (req, res) => {
    const body = parseBody(ChangeBody, req);
    res.json(await service.changePassword(getActor(res), body, info(req)));
  });

  router.get('/v1/me', guards.requireAuth, async (_req, res) => {
    res.json(await service.me(getActor(res)));
  });

  return router;
}
