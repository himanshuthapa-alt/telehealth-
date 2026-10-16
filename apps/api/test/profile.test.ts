import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthSession, PatientProfile } from '@telecare/shared';
import { hashPassword } from '../src/modules/auth/passwords';
import { createUsersRepository } from '../src/modules/users/users.repository';
import { listen, randomPhone, testApp, testDatabase } from './helpers';

const PASSWORD = 'green-mango-42';
// Hashed once per file: argon2 is slow on purpose, and test accounts don't need their own hash.
const PASSWORD_HASH = hashPassword(PASSWORD);
let server: Awaited<ReturnType<typeof listen>>;

beforeAll(async () => {
  server = await listen(testApp().app);
});
afterAll(() => server.close());

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    body: (await res.json()) as PatientProfile & {
      error: { code: string; details?: { fields: Record<string, string> } };
    },
  };
}

async function registerPatient() {
  const res = await fetch(`${server.url}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Asha Devi', phone: randomPhone(), password: PASSWORD, consent: true }),
  });
  return ((await res.json()) as AuthSession).accessToken;
}

describe('patient profile', () => {
  it('starts with only the registration details', async () => {
    const token = await registerPatient();
    const res = await call('GET', '/v1/me/profile', token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fullName: 'Asha Devi',
      dateOfBirth: null,
      gender: null,
      preferredLanguage: null,
      district: null,
    });
    expect(Date.parse(res.body.consentAt!)).not.toBeNaN();
  });

  it('updates only the fields sent, and null clears a field', async () => {
    const token = await registerPatient();
    const first = await call('PATCH', '/v1/me/profile', token, {
      fullName: '  Asha Kumari ',
      dateOfBirth: '1990-04-12',
      preferredLanguage: 'Hindi',
      district: 'Almora',
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      fullName: 'Asha Kumari',
      dateOfBirth: '1990-04-12',
      preferredLanguage: 'Hindi',
      district: 'Almora',
      gender: null,
    });

    const second = await call('PATCH', '/v1/me/profile', token, { gender: 'FEMALE', district: null });
    expect(second.body).toMatchObject({
      fullName: 'Asha Kumari',
      gender: 'FEMALE',
      district: null,
      dateOfBirth: '1990-04-12',
    });
  });

  it('rejects impossible dates, unknown values and unknown fields', async () => {
    const token = await registerPatient();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    for (const body of [
      { dateOfBirth: tomorrow },
      { dateOfBirth: '1850-01-01' },
      { dateOfBirth: '12/04/1990' },
      { preferredLanguage: 'Klingon' },
      { phone: '+919999999999' },
    ]) {
      const res = await call('PATCH', '/v1/me/profile', token, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('is for patients only', async () => {
    const phone = randomPhone();
    await createUsersRepository(testDatabase().db).create({
      phone,
      fullName: 'Dr Test',
      role: 'DOCTOR',
      passwordHash: await PASSWORD_HASH,
      consentAt: null,
    });
    const login = await fetch(`${server.url}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, password: PASSWORD }),
    });
    const { accessToken } = (await login.json()) as AuthSession;
    expect((await call('GET', '/v1/me/profile', accessToken)).status).toBe(403);
    expect((await call('GET', '/v1/me/profile')).status).toBe(401);
  });
});
