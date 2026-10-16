import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthSession,
  DoctorCard,
  DoctorDetail,
  Language,
  Page,
  Role,
  Specialization,
} from '@telecare/shared';
import { hashPassword } from '../src/modules/auth/passwords';
import { doctorProfiles } from '../src/modules/users/doctor-profile.schema';
import { users } from '../src/modules/users/users.schema';
import { listen, randomPhone, testApp, testDatabase } from './helpers';

const { db } = testDatabase();
const PASSWORD = 'green-mango-42';
// Hashed once per file: argon2 is slow on purpose, and test accounts don't need their own hash.
const PASSWORD_HASH = hashPassword(PASSWORD);
// Every doctor made by this run has TAG in its name; searches use q=TAG so other runs' data never interferes.
const TAG = `zq${randomUUID().slice(0, 8)}`;

let server: Awaited<ReturnType<typeof listen>>;
let patientToken: string;
const ids: Record<string, string> = {};

interface DoctorSpec {
  key: string;
  specializations: Specialization[];
  languages: Language[];
  experienceYears: number;
  feeInr: number;
  ratingAvg: number | null;
  isActive?: boolean;
}

async function addDoctor(spec: DoctorSpec, tag = TAG) {
  const [user] = await db
    .insert(users)
    .values({
      phone: randomPhone(),
      fullName: `Dr ${spec.key} ${tag}`,
      role: 'DOCTOR',
      passwordHash: 'unused',
    })
    .returning({ id: users.id });
  await db.insert(doctorProfiles).values({
    userId: user!.id,
    specializations: spec.specializations,
    languages: spec.languages,
    experienceYears: spec.experienceYears,
    feeInr: spec.feeInr,
    ratingAvg: spec.ratingAvg,
    ratingCount: spec.ratingAvg === null ? 0 : 10,
    bio: `Bio of ${spec.key}`,
    registrationNumber: 'SECRET-REG-123',
    isActive: spec.isActive ?? true,
  });
  return user!.id;
}

async function login(role: Role) {
  const phone = randomPhone();
  await db.insert(users).values({ phone, fullName: `${role} user`, role, passwordHash: await PASSWORD_HASH });
  const res = await fetch(`${server.url}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD }),
  });
  return ((await res.json()) as AuthSession).accessToken;
}

async function get<T>(path: string, token: string | undefined = patientToken) {
  const res = await fetch(`${server.url}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: (await res.json()) as T & { error: { code: string } } };
}

/** Search scoped to this run's doctors; returns their keys in result order. */
async function search(params: Record<string, string> = {}) {
  const query = new URLSearchParams({ q: TAG, ...params });
  const res = await get<Page<DoctorCard>>(`/v1/doctors?${query}`);
  expect(res.status).toBe(200);
  return { ...res.body, keys: res.body.items.map((d) => d.name.split(' ')[1]) };
}

beforeAll(async () => {
  server = await listen(testApp().app);
  patientToken = await login('PATIENT');
  const specs: DoctorSpec[] = [
    {
      key: 'Asha',
      specializations: ['Pediatrics'],
      languages: ['Hindi', 'English'],
      experienceYears: 10,
      feeInr: 400,
      ratingAvg: 4.8,
    },
    {
      key: 'Bala',
      specializations: ['Pediatrics', 'General Physician'],
      languages: ['Tamil'],
      experienceYears: 3,
      feeInr: 200,
      ratingAvg: 3.9,
    },
    {
      key: 'Chen',
      specializations: ['Dermatology'],
      languages: ['Hindi'],
      experienceYears: 20,
      feeInr: 700,
      ratingAvg: 4.5,
    },
    {
      key: 'Devi',
      specializations: ['General Physician'],
      languages: ['Hindi', 'Bengali'],
      experienceYears: 1,
      feeInr: 150,
      ratingAvg: null,
    },
    {
      key: 'Eswar',
      specializations: ['Psychiatry'],
      languages: ['English'],
      experienceYears: 15,
      feeInr: 900,
      ratingAvg: 4.1,
    },
    {
      key: 'Gone',
      specializations: ['Pediatrics'],
      languages: ['Hindi'],
      experienceYears: 30,
      feeInr: 100,
      ratingAvg: 5,
      isActive: false,
    },
  ];
  for (const spec of specs) ids[spec.key] = await addDoctor(spec);
});
afterAll(() => server.close());

describe('GET /v1/doctors', () => {
  it('lists active doctors by rating by default, unrated last, inactive never', async () => {
    const res = await search();
    expect(res.keys).toEqual(['Asha', 'Chen', 'Eswar', 'Bala', 'Devi']);
    expect(res.total).toBe(5);
  });

  it.each([
    ['specialization', { specialization: 'Pediatrics' }, ['Asha', 'Bala']],
    ['language', { language: 'Hindi' }, ['Asha', 'Chen', 'Devi']],
    ['minimum rating', { minRating: '4.5' }, ['Asha', 'Chen']],
    ['specialization + language', { specialization: 'General Physician', language: 'Hindi' }, ['Devi']],
    ['language + minimum rating', { language: 'Hindi', minRating: '4' }, ['Asha', 'Chen']],
    [
      'specialization + language + rating',
      { specialization: 'Pediatrics', language: 'Hindi', minRating: '4' },
      ['Asha'],
    ],
    ['a combination nobody matches', { specialization: 'Psychiatry', language: 'Tamil' }, []],
  ])('filters by %s', async (_label, params, expected) => {
    const res = await search(params as Record<string, string>);
    expect(res.keys).toEqual(expected);
    expect(res.total).toBe(expected.length);
  });

  it.each([
    ['experience', ['Chen', 'Eswar', 'Asha', 'Bala', 'Devi']],
    ['fee', ['Devi', 'Bala', 'Asha', 'Chen', 'Eswar']],
  ])('sorts by %s', async (sort, expected) => {
    expect((await search({ sort })).keys).toEqual(expected);
  });

  it('finds doctors by specialization text and by part of the name', async () => {
    const bySpecialty = await get<Page<DoctorCard>>('/v1/doctors?q=psychiat');
    expect(bySpecialty.body.items.map((d) => d.id)).toContain(ids.Eswar);
    const byName = await get<Page<DoctorCard>>(`/v1/doctors?q=chen%20${TAG}`);
    expect(byName.body.items.map((d) => d.id)).toEqual([ids.Chen]);
  });

  it('treats % and _ in the search as plain characters', async () => {
    expect((await get<Page<DoctorCard>>(`/v1/doctors?q=${TAG}%25`)).body.total).toBe(0);
    expect((await get<Page<DoctorCard>>(`/v1/doctors?q=${TAG.slice(0, 3)}_`)).body.total).toBe(0);
  });

  it('pages 20 at a time without repeating or skipping anyone', async () => {
    const tag = `${TAG}p`;
    for (let i = 0; i < 23; i++)
      await addDoctor(
        {
          key: `P${i}`,
          specializations: ['ENT'],
          languages: ['Odia'],
          experienceYears: 5,
          feeInr: 300,
          ratingAvg: 4,
        },
        tag,
      );
    const page1 = await get<Page<DoctorCard>>(`/v1/doctors?q=${tag}`);
    const page2 = await get<Page<DoctorCard>>(`/v1/doctors?q=${tag}&page=2`);
    expect(page1.body).toMatchObject({ page: 1, pageSize: 20, total: 23 });
    expect(page1.body.items).toHaveLength(20);
    expect(page2.body.items).toHaveLength(3);
    const all = [...page1.body.items, ...page2.body.items].map((d) => d.id);
    expect(new Set(all).size).toBe(23);
  });

  it('never returns private fields such as the registration number', async () => {
    const res = await fetch(`${server.url}/v1/doctors?q=${TAG}`, {
      headers: { authorization: `Bearer ${patientToken}` },
    });
    expect(await res.text()).not.toContain('SECRET-REG');
  });

  it('rejects unknown sorts, filters and parameters', async () => {
    for (const query of ['sort=cheapest', 'specialization=Surgery', 'page=0', 'minRating=9', 'role=DOCTOR']) {
      const res = await get(`/v1/doctors?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });
});

describe('GET /v1/doctors/:id', () => {
  it('returns the public profile with bio and without private fields', async () => {
    const res = await get<DoctorDetail>(`/v1/doctors/${ids.Chen}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ids.Chen, bio: 'Bio of Chen', feeInr: 700, ratingAvg: 4.5 });
    expect(JSON.stringify(res.body)).not.toContain('SECRET-REG');
  });

  it('is 404 for inactive, unknown and malformed ids', async () => {
    for (const id of [ids.Gone, randomUUID(), 'not-a-uuid'])
      expect((await get(`/v1/doctors/${id}`)).status, String(id)).toBe(404);
  });
});

describe('who can search', () => {
  it('patients and doctors can; pharmacy admins and anonymous users cannot', async () => {
    expect((await get(`/v1/doctors?q=${TAG}`, await login('DOCTOR'))).status).toBe(200);
    expect((await get(`/v1/doctors?q=${TAG}`, await login('PHARMACY_ADMIN'))).status).toBe(403);
    expect((await get(`/v1/doctors?q=${TAG}`, '')).status).toBe(401);
  });
});
