import { and, eq, sql } from 'drizzle-orm';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthSession, Role } from '@telecare/shared';
import { auditEvents } from '../src/modules/audit/audit.schema';
import { createAuditLog } from '../src/modules/audit/audit';
import { passwordResetCodes } from '../src/modules/auth/auth.schema';
import { hashPassword, verifyPassword } from '../src/modules/auth/passwords';
import { createUsersRepository } from '../src/modules/users/users.repository';
import { users } from '../src/modules/users/users.schema';
import { createAccessTokens, createAuthGuards } from '../src/platform/http/auth';
import { errorHandler } from '../src/platform/http/errors';
import { createLogger } from '../src/platform/logger';
import { listen, randomPhone, testApp, testDatabase, TEST_JWT_SECRET } from './helpers';

const PASSWORD = 'green-mango-42';
// Hashed once per file: argon2 is slow on purpose, and test accounts don't need their own hash.
const PASSWORD_HASH = hashPassword(PASSWORD);
const { db } = testDatabase();

let server: Awaited<ReturnType<typeof listen>>;
let sentCodes: Map<string, string>;

beforeAll(async () => {
  const built = testApp();
  sentCodes = built.sentCodes;
  server = await listen(built.app);
});
afterAll(() => server.close());

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}
const post = (path: string, body?: unknown, token?: string) => call('POST', path, body, token);

async function register(phone = randomPhone(), password = PASSWORD) {
  const res = await post('/v1/auth/register', { fullName: 'Asha Devi', phone, password, consent: true });
  expect(res.status).toBe(201);
  return { phone, session: res.body as AuthSession };
}

/** Staff accounts are provisioned, not self-registered. */
async function provision(role: Role) {
  const phone = randomPhone();
  await createUsersRepository(db).create({
    phone,
    fullName: `Test ${role}`,
    role,
    passwordHash: await PASSWORD_HASH,
    consentAt: null,
  });
  const res = await post('/v1/auth/login', { phone, password: PASSWORD });
  return res.body as AuthSession;
}

const auditFor = (userId: string, action: string) =>
  db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.actorId, userId), eq(auditEvents.action, action)));

describe('password hashing', () => {
  it('uses argon2id and verifies only the right password', async () => {
    const hash = await PASSWORD_HASH;
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain(PASSWORD);
    await expect(verifyPassword(hash, PASSWORD)).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
    await expect(verifyPassword('not-a-hash', PASSWORD)).resolves.toBe(false);
  });
});

describe('register', () => {
  it('creates a patient, normalises the phone and returns a session', async () => {
    const digits = randomPhone().slice(3);
    const { session } = await register(`${digits.slice(0, 5)} ${digits.slice(5)}`);
    expect(session.user).toMatchObject({ phone: `+91${digits}`, fullName: 'Asha Devi', role: 'PATIENT' });
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();

    const [row] = await db.select().from(users).where(eq(users.id, session.user.id));
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row!.consentAt).toBeInstanceOf(Date);
    expect(await auditFor(session.user.id, 'AUTH_REGISTERED')).toHaveLength(1);
  });

  it('rejects a phone number that is already registered', async () => {
    const { phone } = await register();
    const res = await post('/v1/auth/register', {
      fullName: 'Other',
      phone,
      password: PASSWORD,
      consent: true,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });

  it('cannot be used to create a doctor or admin (unknown fields rejected)', async () => {
    const res = await post('/v1/auth/register', {
      fullName: 'Mallory',
      phone: randomPhone(),
      password: PASSWORD,
      consent: true,
      role: 'PHARMACY_ADMIN',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('requires consent, a valid phone and an allowed password, per field', async () => {
    const noConsent = await post('/v1/auth/register', {
      fullName: 'A B',
      phone: randomPhone(),
      password: PASSWORD,
    });
    expect(noConsent.body.error.details.fields).toHaveProperty('consent');

    const badPhone = await post('/v1/auth/register', {
      fullName: 'A B',
      phone: '12345',
      password: PASSWORD,
      consent: true,
    });
    expect(badPhone.body.error.details.fields).toHaveProperty('phone');

    const weak = await post('/v1/auth/register', {
      fullName: 'A B',
      phone: randomPhone(),
      password: 'password123',
      consent: true,
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.fields.password).toMatch(/too common/);
  });
});

describe('login', () => {
  it('logs in with the right password', async () => {
    const { phone, session } = await register();
    const res = await post('/v1/auth/login', { phone, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(session.user.id);
    expect(await auditFor(session.user.id, 'AUTH_LOGIN_SUCCEEDED')).toHaveLength(1);
  });

  it('gives the same answer for a wrong password and an unknown phone', async () => {
    const { phone, session } = await register();
    const wrong = await post('/v1/auth/login', { phone, password: 'not-my-password' });
    const unknown = await post('/v1/auth/login', { phone: randomPhone(), password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect({ ...wrong.body.error, requestId: 0 }).toEqual({ ...unknown.body.error, requestId: 0 });
    expect(await auditFor(session.user.id, 'AUTH_LOGIN_FAILED')).toHaveLength(1);
  });

  it('blocks a phone after 5 attempts in 15 minutes', async () => {
    const { phone } = await register();
    for (let i = 0; i < 5; i++) await post('/v1/auth/login', { phone, password: 'guess-' + i + '-xyz' });
    const blocked = await post('/v1/auth/login', { phone, password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('protected endpoints', () => {
  it('reject requests without a valid access token', async () => {
    expect((await call('GET', '/v1/me')).status).toBe(401);
    expect((await call('GET', '/v1/me', undefined, 'garbage')).status).toBe(401);

    const forged = await createAccessTokens('another-secret-another-secret-12345').sign({
      id: '00000000-0000-0000-0000-000000000000',
      role: 'PHARMACY_ADMIN',
    });
    const res = await call('GET', '/v1/me', undefined, forged);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('return the current user with a valid token', async () => {
    const { session } = await register();
    const res = await call('GET', '/v1/me', undefined, session.accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(session.user);
  });
});

describe('role guard', () => {
  it('allows the right role, refuses others with 403 and audits the attempt', async () => {
    const tokens = createAccessTokens(TEST_JWT_SECRET);
    const guards = createAuthGuards(tokens, createAuditLog(db));
    const app = express();
    app.get('/doctor-only', guards.requireAuth, guards.requireRole('DOCTOR'), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler(createLogger('silent')));
    const guarded = await listen(app);
    try {
      const doctor = await provision('DOCTOR');
      const { session: patient } = await register();
      const get = (token: string) =>
        fetch(`${guarded.url}/doctor-only`, { headers: { authorization: `Bearer ${token}` } });

      expect((await get(doctor.accessToken)).status).toBe(200);
      const denied = await get(patient.accessToken);
      expect(denied.status).toBe(403);
      expect(((await denied.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
      const [event] = await auditFor(patient.user.id, 'ACCESS_DENIED');
      expect(event!.metadata).toEqual({ method: 'GET', path: '/doctor-only' });
    } finally {
      await guarded.close();
    }
  });

  it('works for all three roles through login', async () => {
    for (const role of ['DOCTOR', 'PHARMACY_ADMIN'] as const) {
      const session = await provision(role);
      expect(session.user.role).toBe(role);
      expect((await call('GET', '/v1/me', undefined, session.accessToken)).body.role).toBe(role);
    }
  });
});

describe('refresh tokens', () => {
  it('rotate: the old token stops working and the new one works', async () => {
    const { session } = await register();
    const first = await post('/v1/auth/refresh', { refreshToken: session.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(session.refreshToken);
    expect((await post('/v1/auth/refresh', { refreshToken: first.body.refreshToken })).status).toBe(200);
  });

  it('reusing an old token ends every session of that user', async () => {
    const { session } = await register();
    const rotated = await post('/v1/auth/refresh', { refreshToken: session.refreshToken });

    const reuse = await post('/v1/auth/refresh', { refreshToken: session.refreshToken });
    expect(reuse.status).toBe(401);
    expect(await auditFor(session.user.id, 'AUTH_REFRESH_TOKEN_REUSED')).toHaveLength(1);
    // The legitimately rotated token is revoked too, because the family is compromised.
    expect((await post('/v1/auth/refresh', { refreshToken: rotated.body.refreshToken })).status).toBe(401);
  });

  it('can be rotated only once even by concurrent requests', async () => {
    const { session } = await register();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post('/v1/auth/refresh', { refreshToken: session.refreshToken })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('logout revokes the refresh token and always answers 204', async () => {
    const { session } = await register();
    expect((await post('/v1/auth/logout', { refreshToken: session.refreshToken })).status).toBe(204);
    expect((await post('/v1/auth/refresh', { refreshToken: session.refreshToken })).status).toBe(401);
    expect((await post('/v1/auth/logout', { refreshToken: 'unknown-token' })).status).toBe(204);
  });
});

describe('password reset', () => {
  const NEW_PASSWORD = 'blue-river-77';

  it('answers the same for unknown phones and sends nothing', async () => {
    const phone = randomPhone();
    const res = await post('/v1/auth/password/forgot', { phone });
    expect(res.status).toBe(202);
    expect(sentCodes.has(phone)).toBe(false);
  });

  it('resets with the code, ends old sessions, and the code works once', async () => {
    const { phone, session } = await register();
    expect((await post('/v1/auth/password/forgot', { phone })).status).toBe(202);
    const code = sentCodes.get(phone)!;
    expect(code).toMatch(/^\d{6}$/);

    expect((await post('/v1/auth/password/reset', { phone, code, newPassword: NEW_PASSWORD })).status).toBe(
      204,
    );
    expect((await post('/v1/auth/login', { phone, password: PASSWORD })).status).toBe(401);
    expect((await post('/v1/auth/login', { phone, password: NEW_PASSWORD })).status).toBe(200);
    expect((await post('/v1/auth/refresh', { refreshToken: session.refreshToken })).status).toBe(401);

    const again = await post('/v1/auth/password/reset', { phone, code, newPassword: 'another-pass-99' });
    expect(again.body.error.code).toBe('INVALID_RESET_CODE');
  });

  it('locks the code after 5 wrong attempts', async () => {
    const { phone } = await register();
    await post('/v1/auth/password/forgot', { phone });
    const code = sentCodes.get(phone)!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await post('/v1/auth/password/reset', { phone, code: wrong, newPassword: NEW_PASSWORD });
    const res = await post('/v1/auth/password/reset', { phone, code, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_CODE');
  });

  it('rejects an expired code and a replaced code', async () => {
    const { phone, session } = await register();
    await post('/v1/auth/password/forgot', { phone });
    const firstCode = sentCodes.get(phone)!;
    await post('/v1/auth/password/forgot', { phone });
    const secondCode = sentCodes.get(phone)!;
    if (firstCode !== secondCode) {
      const replaced = await post('/v1/auth/password/reset', {
        phone,
        code: firstCode,
        newPassword: NEW_PASSWORD,
      });
      expect(replaced.body.error.code).toBe('INVALID_RESET_CODE');
    }

    await db
      .update(passwordResetCodes)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(passwordResetCodes.userId, session.user.id));
    const expired = await post('/v1/auth/password/reset', {
      phone,
      code: secondCode,
      newPassword: NEW_PASSWORD,
    });
    expect(expired.body.error.code).toBe('INVALID_RESET_CODE');
  });
});

describe('change password', () => {
  it('needs the current password, then ends other sessions and returns a new one', async () => {
    const { phone, session } = await register();
    const wrong = await post(
      '/v1/auth/password/change',
      { currentPassword: 'not-it-at-all', newPassword: 'blue-river-77' },
      session.accessToken,
    );
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

    const ok = await post(
      '/v1/auth/password/change',
      { currentPassword: PASSWORD, newPassword: 'blue-river-77' },
      session.accessToken,
    );
    expect(ok.status).toBe(200);
    // Another device's old session is refused, without logging out the new one.
    expect((await post('/v1/auth/refresh', { refreshToken: session.refreshToken })).status).toBe(401);
    expect((await post('/v1/auth/refresh', { refreshToken: ok.body.refreshToken })).status).toBe(200);
    expect(await auditFor(session.user.id, 'AUTH_REFRESH_TOKEN_REUSED')).toHaveLength(0);
    expect((await post('/v1/auth/login', { phone, password: 'blue-river-77' })).status).toBe(200);
  });
});

describe('audit log', () => {
  it('is append-only at the database level', async () => {
    const { session } = await register();
    await expect(
      db.update(auditEvents).set({ action: 'TAMPERED' }).where(eq(auditEvents.actorId, session.user.id)),
    ).rejects.toThrow();
    await expect(db.delete(auditEvents).where(eq(auditEvents.actorId, session.user.id))).rejects.toThrow();
  });
});
