import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthSession,
  DoctorCard,
  DoctorForReview,
  DoctorStats,
  MyDoctorProfile,
  Page,
} from '@telecare/shared';
import { hashPassword } from '../src/modules/auth/passwords';
import { createUsersRepository } from '../src/modules/users/users.repository';
import { listen, randomPhone, testApp, testDatabase } from './helpers';

const PASSWORD = 'green-mango-42';
const { db } = testDatabase();
// Unique name fragment so the directory search only finds this run's doctor.
const TAG = `zv${randomUUID().slice(0, 8)}`;

let server: Awaited<ReturnType<typeof listen>>;
beforeAll(async () => {
  server = await listen(testApp().app);
});
afterAll(() => server.close());

async function call<T = unknown>(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
}

async function loginAs(role: 'ADMIN' | 'PATIENT') {
  const phone = randomPhone();
  await createUsersRepository(db).create({
    phone,
    fullName: `Test ${role}`,
    role,
    passwordHash: await hashPassword(PASSWORD),
    consentAt: null,
  });
  const res = await call<AuthSession>('POST', '/v1/auth/login', { phone, password: PASSWORD });
  return res.body.accessToken;
}

const signup = {
  fullName: `Dr Meera ${TAG}`,
  password: PASSWORD,
  consent: true,
  registrationNumber: 'MMC-2019/12345',
  qualification: 'MBBS, DCH',
  specializations: ['Pediatrics'],
  languages: ['Hindi', 'English'],
  experienceYears: 6,
  feeInr: 300,
  bio: 'Child specialist',
};

describe('doctor self-registration and verification', () => {
  let doctor: AuthSession;
  let admin: string;
  let patient: string;
  const listed = async () =>
    (await call<Page<DoctorCard>>('GET', `/v1/doctors?q=${TAG}`, undefined, patient)).body.items;

  beforeAll(async () => {
    admin = await loginAs('ADMIN');
    patient = await loginAs('PATIENT');
    const res = await call<AuthSession>('POST', '/v1/auth/register/doctor', {
      ...signup,
      phone: randomPhone(),
    });
    expect(res.status).toBe(201);
    doctor = res.body;
  });

  it('creates a DOCTOR account whose profile is PENDING and hidden from patients', async () => {
    expect(doctor.user.role).toBe('DOCTOR');
    const me = await call<MyDoctorProfile>('GET', '/v1/me/doctor-profile', undefined, doctor.accessToken);
    expect(me.body).toMatchObject({
      verificationStatus: 'PENDING',
      registrationNumber: 'MMC-2019/12345',
      qualification: 'MBBS, DCH',
    });
    expect(await listed()).toEqual([]);
    const slots = await call('GET', `/v1/doctors/${doctor.user.id}/slots`, undefined, patient);
    expect(slots.status).toBe(404);
  });

  it('blocks doctor-only endpoints on the server until approved', async () => {
    const res = await call('GET', '/v1/appointments?scope=today', undefined, doctor.accessToken);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'DOCTOR_NOT_VERIFIED' } });
  });

  it('rejects a sign-up without a registration number', async () => {
    const res = await call('POST', '/v1/auth/register/doctor', {
      ...signup,
      phone: randomPhone(),
      registrationNumber: '',
    });
    expect(res.status).toBe(400);
  });

  it('only admins can see the queue and decide', async () => {
    expect((await call('GET', '/v1/admin/doctors', undefined, patient)).status).toBe(403);
    const queue = await call<DoctorForReview[]>('GET', '/v1/admin/doctors', undefined, admin);
    expect(queue.body.some((d) => d.id === doctor.user.id)).toBe(true);
    const rejectNoReason = await call(
      'POST',
      `/v1/admin/doctors/${doctor.user.id}/verification`,
      { status: 'REJECTED' },
      admin,
    );
    expect(rejectNoReason.status).toBe(400);
  });

  it('lists the doctor once approved, above demo doctors', async () => {
    const res = await call(
      'POST',
      `/v1/admin/doctors/${doctor.user.id}/verification`,
      { status: 'APPROVED' },
      admin,
    );
    expect(res.status).toBe(204);
    const items = await listed();
    expect(items.map((d) => d.id)).toEqual([doctor.user.id]);
    expect(items[0]).not.toHaveProperty('registrationNumber');
    const all = (await call<Page<DoctorCard>>('GET', '/v1/doctors?sort=fee', undefined, patient)).body.items;
    const firstDemo = all.findIndex((d) => d.isDemo);
    if (firstDemo >= 0) expect(all.slice(firstDemo).every((d) => d.isDemo)).toBe(true);
  });

  it('lets the doctor edit their profile and read stats', async () => {
    const res = await call<MyDoctorProfile>(
      'PATCH',
      '/v1/me/doctor-profile',
      { feeInr: 450, languages: ['Hindi', 'Hindi', 'Marathi'] },
      doctor.accessToken,
    );
    expect(res.body).toMatchObject({ feeInr: 450, languages: ['Hindi', 'Marathi'] });
    const bad = await call(
      'PATCH',
      '/v1/me/doctor-profile',
      { verificationStatus: 'APPROVED' },
      doctor.accessToken,
    );
    expect(bad.status).toBe(400);
    const stats = await call<DoctorStats>('GET', '/v1/me/doctor-stats', undefined, doctor.accessToken);
    expect(stats.body).toEqual({ today: 0, upcoming: 0, completed: 0, earningsInr: 0 });
  });

  it('removing approval locks the doctor out again', async () => {
    const res = await call(
      'POST',
      `/v1/admin/doctors/${doctor.user.id}/verification`,
      { status: 'REJECTED', note: 'Registration lapsed' },
      admin,
    );
    expect(res.status).toBe(204);
    expect((await call('GET', '/v1/appointments?scope=today', undefined, doctor.accessToken)).status).toBe(
      403,
    );
    const me = await call<MyDoctorProfile>('GET', '/v1/me/doctor-profile', undefined, doctor.accessToken);
    expect(me.body).toMatchObject({
      verificationStatus: 'REJECTED',
      verificationNote: 'Registration lapsed',
    });
    expect(await listed()).toEqual([]);
  });
});
