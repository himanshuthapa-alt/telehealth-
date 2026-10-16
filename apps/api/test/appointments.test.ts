import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Appointment,
  Availability,
  AuthSession,
  DoctorCard,
  Page,
  Role,
  SlotsResponse,
} from '@telecare/shared';
import { appointments } from '../src/modules/appointments/appointments.schema';
import { auditEvents } from '../src/modules/audit/audit.schema';
import { hashPassword } from '../src/modules/auth/passwords';
import { doctorProfiles } from '../src/modules/users/doctor-profile.schema';
import { patientProfiles } from '../src/modules/users/patient-profile.schema';
import { users } from '../src/modules/users/users.schema';
import { listen, randomPhone, testApp, testDatabase } from './helpers';

const { db } = testDatabase();
const PASSWORD = 'green-mango-42';
// Hashed once per file: argon2 is slow on purpose, and test accounts don't need their own hash.
const PASSWORD_HASH = hashPassword(PASSWORD);
const TAG = `ap${randomUUID().slice(0, 8)}`;

// Monday 7 Jan 2030, 08:00 IST. Doctors consult 09:00–13:00 IST in 30-minute slots.
const NOW = new Date('2030-01-07T02:30:00Z');
const TODAY = '2030-01-07';
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  startTime: '09:00',
  endTime: '13:00',
  slotMinutes: 30,
}));

type Server = Awaited<ReturnType<typeof listen>>;
let server: Server;

async function call<T = unknown>(
  base: Server,
  method: string,
  path: string,
  token: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${base.url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: (text ? JSON.parse(text) : undefined) as T & {
      error: { code: string; details?: { fields: Record<string, string> } };
    },
  };
}
const api = <T = unknown>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  headers?: Record<string, string>,
) => call<T>(server, method, path, token, body, headers);

async function makeUser(role: Role, name: string) {
  const phone = randomPhone();
  const [user] = await db
    .insert(users)
    .values({ phone, fullName: `${name} ${TAG}`, role, passwordHash: await PASSWORD_HASH })
    .returning({ id: users.id });
  if (role === 'DOCTOR')
    await db.insert(doctorProfiles).values({
      userId: user!.id,
      specializations: ['General Physician'],
      languages: ['Hindi'],
      experienceYears: 5,
      feeInr: 300,
    });
  const res = await fetch(`${server.url}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD }),
  });
  return { id: user!.id, token: ((await res.json()) as AuthSession).accessToken };
}

/** A doctor with the standard 09:00–13:00 week, set through the doctor's own API. */
async function makeDoctor(name = 'Doc') {
  const doctor = await makeUser('DOCTOR', name);
  expect((await api('PUT', '/v1/availability/rules', doctor.token, { rules: WEEK })).status).toBe(200);
  return doctor;
}

function book(
  patientToken: string,
  doctorId: string,
  startAt: string,
  key = randomUUID(),
  reasonNote?: string,
) {
  return api<Appointment>(
    'POST',
    '/v1/appointments',
    patientToken,
    { doctorId, startAt, reasonNote },
    { 'idempotency-key': key },
  );
}

const slotTimes = (res: SlotsResponse, date: string) =>
  res.days.find((d) => d.date === date)!.slots.map((s) => s.startAt);

beforeAll(async () => {
  server = await listen(testApp({ now: () => NOW }).app);
});
afterAll(() => server.close());

describe('doctor availability', () => {
  it('saves the weekly template and rejects overlapping, too-short and odd-length blocks', async () => {
    const doctor = await makeDoctor();
    const saved = await api<Availability>('GET', '/v1/availability', doctor.token);
    expect(saved.body.rules).toHaveLength(7);
    expect(saved.body.rules[0]).toEqual({
      weekday: 1,
      startTime: '09:00',
      endTime: '13:00',
      slotMinutes: 30,
    });

    for (const rules of [
      [WEEK[0], { weekday: 1, startTime: '12:00', endTime: '14:00', slotMinutes: 30 }], // overlaps
      [{ weekday: 1, startTime: '09:00', endTime: '09:10', slotMinutes: 15 }], // no slot fits
      [{ weekday: 1, startTime: '09:00', endTime: '10:00', slotMinutes: 25 }], // not an offered length
      [{ weekday: 8, startTime: '09:00', endTime: '10:00', slotMinutes: 30 }],
    ])
      expect(
        (await api('PUT', '/v1/availability/rules', doctor.token, { rules })).status,
        JSON.stringify(rules),
      ).toBe(400);
  });

  it('blocks and unblocks a date; blocked days offer no slots', async () => {
    const doctor = await makeDoctor();
    const blocked = await api<{ bookedThatDay: number }>(
      'PUT',
      '/v1/availability/exceptions/2030-01-08',
      doctor.token,
      { reason: 'Leave' },
    );
    expect(blocked.body).toMatchObject({ date: '2030-01-08', reason: 'Leave', bookedThatDay: 0 });

    const slots = await api<SlotsResponse>(
      'GET',
      `/v1/doctors/${doctor.id}/slots?from=2030-01-08&days=1`,
      doctor.token,
    );
    expect(slotTimes(slots.body, '2030-01-08')).toEqual([]);

    expect((await api('DELETE', '/v1/availability/exceptions/2030-01-08', doctor.token)).status).toBe(204);
    const after = await api<SlotsResponse>(
      'GET',
      `/v1/doctors/${doctor.id}/slots?from=2030-01-08&days=1`,
      doctor.token,
    );
    expect(slotTimes(after.body, '2030-01-08')).toHaveLength(8);
    expect((await api('PUT', '/v1/availability/exceptions/2030-01-01', doctor.token, {})).status).toBe(400); // past
  });

  it('is for doctors only', async () => {
    const patient = await makeUser('PATIENT', 'Pat');
    expect((await api('PUT', '/v1/availability/rules', patient.token, { rules: WEEK })).status).toBe(403);
  });
});

describe('slots', () => {
  it('lists 30-minute slots per IST day within the 14-day horizon', async () => {
    const doctor = await makeDoctor();
    const patient = await makeUser('PATIENT', 'Pat');
    const res = await api<SlotsResponse>('GET', `/v1/doctors/${doctor.id}/slots?days=2`, patient.token);
    expect(res.body.days.map((d) => d.date)).toEqual([TODAY, '2030-01-08']);
    expect(slotTimes(res.body, TODAY)[0]).toBe(at(TODAY, '09:00'));
    expect(slotTimes(res.body, TODAY)).toHaveLength(8);

    const lastDay = await api<SlotsResponse>(
      'GET',
      `/v1/doctors/${doctor.id}/slots?from=2030-01-20&days=7`,
      patient.token,
    );
    expect(lastDay.body.days.map((d) => d.date)).toEqual(['2030-01-20']); // clipped at the horizon
    for (const from of ['2030-01-21', '2030-01-06'])
      expect(
        (await api('GET', `/v1/doctors/${doctor.id}/slots?from=${from}`, patient.token)).status,
        from,
      ).toBe(400);
  });

  it('patients see any doctor; doctors only themselves; unknown doctors are 404', async () => {
    const doctor = await makeDoctor();
    const other = await makeDoctor();
    const pharmacy = await makeUser('PHARMACY_ADMIN', 'Ph');
    expect((await api('GET', `/v1/doctors/${doctor.id}/slots`, doctor.token)).status).toBe(200);
    expect((await api('GET', `/v1/doctors/${doctor.id}/slots`, other.token)).status).toBe(404);
    expect((await api('GET', `/v1/doctors/${doctor.id}/slots`, pharmacy.token)).status).toBe(403);
    const patient = await makeUser('PATIENT', 'Pat');
    expect((await api('GET', `/v1/doctors/${randomUUID()}/slots`, patient.token)).status).toBe(404);
  });
});

describe('booking', () => {
  it('books a slot, removes it from the free list, and shows it on the doctor side', async () => {
    const doctor = await makeDoctor('Rao');
    const patient = await makeUser('PATIENT', 'Asha');
    await db.insert(patientProfiles).values({ userId: patient.id, dateOfBirth: '1990-01-01' });

    const res = await book(patient.token, doctor.id, at(TODAY, '11:00'), undefined, '  Fever for 3 days  ');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'BOOKED',
      startAt: at(TODAY, '11:00'),
      endAt: at(TODAY, '11:30'),
      reasonNote: 'Fever for 3 days',
      doctor: { id: doctor.id, name: `Rao ${TAG}`, specializations: ['General Physician'] },
      patient: { id: patient.id, name: `Asha ${TAG}`, age: 40 },
    });

    const free = await api<SlotsResponse>('GET', `/v1/doctors/${doctor.id}/slots?days=1`, patient.token);
    expect(slotTimes(free.body, TODAY)).not.toContain(at(TODAY, '11:00'));

    // Blueprint done-criterion: the booking is visible on the doctor's side.
    const today = await api<Appointment[]>('GET', '/v1/appointments?scope=today', doctor.token);
    expect(today.body.map((a) => a.id)).toEqual([res.body.id]);
    expect(today.body[0]!.patient).toEqual({ id: patient.id, name: `Asha ${TAG}`, age: 40 });
    expect(JSON.stringify(today.body)).not.toMatch(/\+91\d{10}/); // no phone numbers

    const upcoming = await api<Appointment[]>('GET', '/v1/appointments', patient.token);
    expect(upcoming.body.map((a) => a.id)).toEqual([res.body.id]);

    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, res.body.id), eq(auditEvents.action, 'APPOINTMENT_BOOKED')));
    expect(event!.actorId).toBe(patient.id);
  });

  it('refuses times that are not real, too soon, too far, or on a blocked day', async () => {
    const doctor = await makeDoctor();
    const patient = await makeUser('PATIENT', 'Pat');
    await api('PUT', '/v1/availability/exceptions/2030-01-09', doctor.token, {});
    for (const startAt of [
      at(TODAY, '09:10'), // not on the 30-minute grid
      at(TODAY, '14:00'), // outside hours
      at('2030-01-21', '09:00'), // past the 14-day horizon
      at('2030-01-09', '09:00'), // blocked day
      at('2030-01-06', '09:00'), // yesterday
    ]) {
      const res = await book(patient.token, doctor.id, startAt);
      expect(res.status, startAt).toBe(409);
      expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
    }

    // 08:45 IST: the 09:00 slot is less than 30 minutes away.
    const late = await listen(testApp({ now: () => new Date('2030-01-07T03:15:00Z') }).app);
    try {
      const res = await call(
        late,
        'POST',
        '/v1/appointments',
        patient.token,
        { doctorId: doctor.id, startAt: at(TODAY, '09:00') },
        { 'idempotency-key': randomUUID() },
      );
      expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
    } finally {
      await late.close();
    }
  });

  it('refuses a slot someone else holds, and a patient booking two doctors at once', async () => {
    const doctor = await makeDoctor();
    const other = await makeDoctor();
    const first = await makeUser('PATIENT', 'First');
    const second = await makeUser('PATIENT', 'Second');
    expect((await book(first.token, doctor.id, at(TODAY, '10:00'))).status).toBe(201);

    const taken = await book(second.token, doctor.id, at(TODAY, '10:00'));
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('SLOT_TAKEN');

    const clash = await book(first.token, other.id, at(TODAY, '10:00'));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('TIME_CONFLICT');
  });

  it('CONCURRENCY: 10 patients booking the same slot at the same moment -> exactly one wins', async () => {
    const doctor = await makeDoctor();
    const patients = await Promise.all(
      Array.from({ length: 10 }, (_, i) => makeUser('PATIENT', `Racer${i}`)),
    );
    const results = await Promise.all(
      patients.map((p) => book(p.token, doctor.id, at('2030-01-08', '10:00'))),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.body.error?.code === 'SLOT_TAKEN')).toHaveLength(9);
    const rows = await db.select().from(appointments).where(eq(appointments.doctorId, doctor.id));
    expect(rows.filter((r) => r.status === 'BOOKED')).toHaveLength(1);
  });

  it('IDEMPOTENCY: retries with the same key return the same appointment, even when sent at once', async () => {
    const doctor = await makeDoctor();
    const patient = await makeUser('PATIENT', 'Retry');
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => book(patient.token, doctor.id, at('2030-01-08', '11:00'), key)),
    );

    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200)).toHaveLength(4);

    const reused = await book(patient.token, doctor.id, at('2030-01-08', '12:00'), key);
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe('CONFLICT');
    const missing = await api('POST', '/v1/appointments', patient.token, {
      doctorId: doctor.id,
      startAt: at('2030-01-08', '12:00'),
    });
    expect(missing.status).toBe(400);
  });

  it('only patients can book', async () => {
    const doctor = await makeDoctor();
    expect((await book(doctor.token, doctor.id, at(TODAY, '10:00'))).status).toBe(403);
  });
});

describe('viewing and cancelling', () => {
  it('appointments are visible only to their patient and doctor (others get 404)', async () => {
    const doctor = await makeDoctor();
    const patient = await makeUser('PATIENT', 'Own');
    const { body } = await book(patient.token, doctor.id, at(TODAY, '12:00'));
    const stranger = await makeUser('PATIENT', 'Stranger');
    const otherDoctor = await makeDoctor();

    expect((await api('GET', `/v1/appointments/${body.id}`, patient.token)).status).toBe(200);
    expect((await api('GET', `/v1/appointments/${body.id}`, doctor.token)).status).toBe(200);
    expect((await api('GET', `/v1/appointments/${body.id}`, stranger.token)).status).toBe(404);
    expect((await api('GET', `/v1/appointments/${body.id}`, otherDoctor.token)).status).toBe(404);
    expect((await api('POST', `/v1/appointments/${body.id}/cancel`, stranger.token, {})).status).toBe(404);
    expect((await api('GET', '/v1/appointments/not-a-uuid', patient.token)).status).toBe(404);
  });

  it('a patient cancels before the cutoff; the slot frees up and moves to Past', async () => {
    const doctor = await makeDoctor();
    const patient = await makeUser('PATIENT', 'Cancel');
    const { body } = await book(patient.token, doctor.id, at('2030-01-08', '09:30'));

    const res = await api<Appointment>('POST', `/v1/appointments/${body.id}/cancel`, patient.token, {
      reason: 'Feeling better',
    });
    expect(res.body).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'PATIENT',
      cancelReason: 'Feeling better',
    });

    const again = await api('POST', `/v1/appointments/${body.id}/cancel`, patient.token, {});
    expect(again.body.error.code).toBe('INVALID_STATE');

    const someoneElse = await makeUser('PATIENT', 'Next');
    expect((await book(someoneElse.token, doctor.id, at('2030-01-08', '09:30'))).status).toBe(201);
    const past = await api<Appointment[]>('GET', '/v1/appointments?scope=past', patient.token);
    expect(past.body.map((a) => a.id)).toContain(body.id);
  });

  it('a patient cannot cancel within 2 hours of the start', async () => {
    const doctor = await makeDoctor();
    const patient = await makeUser('PATIENT', 'Late');
    const { body } = await book(patient.token, doctor.id, at(TODAY, '09:30')); // 90 minutes away
    const res = await api('POST', `/v1/appointments/${body.id}/cancel`, patient.token, {});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANCEL_TOO_LATE');
  });

  it('a doctor can cancel before the start, but must give a reason', async () => {
    const doctor = await makeDoctor();
    const patient = await makeUser('PATIENT', 'DocCancel');
    const { body } = await book(patient.token, doctor.id, at(TODAY, '09:30'));
    const noReason = await api('POST', `/v1/appointments/${body.id}/cancel`, doctor.token, {});
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.details!.fields).toHaveProperty('reason');

    const ok = await api<Appointment>('POST', `/v1/appointments/${body.id}/cancel`, doctor.token, {
      reason: 'Emergency at clinic',
    });
    expect(ok.body).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'DOCTOR',
      cancelReason: 'Emergency at clinic',
    });
  });
});

describe('doctor search by availability', () => {
  it('"today" needs hours left today on an unblocked day; "week" looks 7 days ahead', async () => {
    const withHours = await makeDoctor('Avail');
    const noHours = await makeUser('DOCTOR', 'NoHours');
    const blockedToday = await makeDoctor('Blocked');
    await api('PUT', `/v1/availability/exceptions/${TODAY}`, blockedToday.token, {});
    const patient = await makeUser('PATIENT', 'Searcher');

    const search = async (available: string) =>
      (
        await api<Page<DoctorCard>>('GET', `/v1/doctors?q=${TAG}&available=${available}`, patient.token)
      ).body.items.map((d) => d.id);
    const today = await search('today');
    expect(today).toContain(withHours.id);
    expect(today).not.toContain(noHours.id);
    expect(today).not.toContain(blockedToday.id);
    expect(await search('week')).toContain(blockedToday.id);
  });
});
