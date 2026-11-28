import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Appointment,
  AuthSession,
  ConsultationUpdates,
  DoctorCard,
  DoctorStats,
  JoinResponse,
  Order,
  Page,
  Prescription,
} from '@telecare/shared';
import { hashPassword } from '../src/modules/auth/passwords';
import { medicines, pharmacies } from '../src/modules/pharmacy/pharmacy.schema';
import { createUsersRepository } from '../src/modules/users/users.repository';
import { listen, randomPhone, testApp, testDatabase } from './helpers';

/**
 * The whole demo journey through the real API, in order (blueprint §3.1):
 * doctor signs up → admin verifies → doctor sets hours → patient registers,
 * finds and books → both join → consultation with chat → prescription →
 * order from it → pharmacy delivers → patient tracks; doctor's stats update.
 * Each step relies on the previous one, so a break anywhere in the chain fails here.
 */

const { db } = testDatabase();
const PASSWORD = 'green-mango-42';
// Mon 3 Mar 2031: after every other test file's fixed dates, so no other sweep touches these rows.
const ist = (hhmm: string) => new Date(`2031-03-03T${hhmm}:00+05:30`);
let clock = ist('08:00');
const TAG = `zj${randomUUID().slice(0, 8)}`;

let server: Awaited<ReturnType<typeof listen>>;
let pharmacyId: string;
let medicineId: string;

async function api<T = unknown>(method: string, path: string, token?: string, body?: unknown, headers = {}) {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token && { authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
}

async function provisioned(role: 'ADMIN' | 'PHARMACY_ADMIN') {
  const phone = randomPhone();
  await createUsersRepository(db).create({
    phone,
    fullName: `Test ${role}`,
    role,
    passwordHash: await hashPassword(PASSWORD),
    consentAt: null,
  });
  return (await api<AuthSession>('POST', '/v1/auth/login', undefined, { phone, password: PASSWORD })).body
    .accessToken;
}

beforeAll(async () => {
  server = await listen(testApp({ now: () => clock }).app);
  const [pharmacy] = await db
    .insert(pharmacies)
    .values({ name: `Journey pharmacy ${TAG}`, address: 'Test' })
    .returning();
  pharmacyId = pharmacy!.id;
  const [medicine] = await db
    .insert(medicines)
    .values({
      pharmacyId,
      name: `Paracetamol ${TAG}`,
      genericName: 'Paracetamol',
      form: 'TABLET',
      strength: '500 mg',
      packSize: '10 tablets',
      pricePaise: 2500,
      stockQty: 50,
      requiresPrescription: false,
    })
    .returning();
  medicineId = medicine!.id;
});
afterAll(() => server.close());

describe('the full demo journey', () => {
  it('runs from doctor sign-up to a delivered order', async () => {
    // 1. A doctor signs up and waits for approval.
    const doctor = (
      await api<AuthSession>('POST', '/v1/auth/register/doctor', undefined, {
        fullName: `Dr Kavya ${TAG}`,
        phone: randomPhone(),
        password: PASSWORD,
        consent: true,
        registrationNumber: 'KMC-2015/778',
        qualification: 'MBBS, MD',
        specializations: ['General Physician'],
        languages: ['Hindi', 'English'],
        experienceYears: 9,
        feeInr: 250,
        bio: '',
      })
    ).body;
    expect(doctor.user.role).toBe('DOCTOR');

    // 2. The admin approves; the doctor sets weekday hours.
    const admin = await provisioned('ADMIN');
    expect(
      (await api('POST', `/v1/admin/doctors/${doctor.user.id}/verification`, admin, { status: 'APPROVED' }))
        .status,
    ).toBe(204);
    const rules = [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startTime: '09:00',
      endTime: '13:00',
      slotMinutes: 15,
    }));
    expect((await api('PUT', '/v1/availability/rules', doctor.accessToken, { rules })).status).toBe(200);

    // 3. A patient registers, finds the doctor, and books 10:00.
    const patient = (
      await api<AuthSession>('POST', '/v1/auth/register', undefined, {
        fullName: 'Ramesh Kumar',
        phone: randomPhone(),
        password: PASSWORD,
        consent: true,
      })
    ).body;
    const found = await api<Page<DoctorCard>>('GET', `/v1/doctors?q=${TAG}`, patient.accessToken);
    expect(found.body.items.map((d) => d.id)).toEqual([doctor.user.id]);
    const booking = await api<Appointment>(
      'POST',
      '/v1/appointments',
      patient.accessToken,
      { doctorId: doctor.user.id, startAt: ist('10:00').toISOString(), reasonNote: 'Fever for 3 days' },
      { 'idempotency-key': randomUUID() },
    );
    expect(booking.status).toBe(201);
    const today = await api<Appointment[]>('GET', '/v1/appointments?scope=today', doctor.accessToken);
    expect(today.body.map((a) => a.id)).toContain(booking.body.id);

    // 4. Both join at 09:55; the doctor starts; they chat.
    clock = ist('09:55');
    const joined = await api<JoinResponse>(
      'POST',
      `/v1/appointments/${booking.body.id}/join`,
      patient.accessToken,
    );
    expect(joined.status).toBe(200);
    const consultationId = joined.body.consultation.id;
    await api('POST', `/v1/appointments/${booking.body.id}/join`, doctor.accessToken);
    expect((await api('POST', `/v1/consultations/${consultationId}/start`, doctor.accessToken)).status).toBe(
      200,
    );
    await api('POST', `/v1/consultations/${consultationId}/messages`, patient.accessToken, {
      clientMsgId: randomUUID(),
      body: 'Namaste doctor',
    });

    // 5. The doctor writes and issues a prescription; it shows qualification + registration.
    const draft = await api<Prescription>(
      'POST',
      `/v1/consultations/${consultationId}/prescription`,
      doctor.accessToken,
    );
    await api('PUT', `/v1/prescriptions/${draft.body.id}`, doctor.accessToken, {
      items: [
        {
          medicineId,
          medicineName: `Paracetamol ${TAG}`,
          dosage: '1 tablet',
          frequency: 'TWICE_A_DAY',
          durationDays: 5,
          quantity: 10,
          instructions: 'After food',
        },
      ],
      generalInstructions: 'Rest and fluids.',
      validDays: 30,
    });
    const rx = await api<Prescription>(
      'POST',
      `/v1/prescriptions/${draft.body.id}/issue`,
      doctor.accessToken,
    );
    expect(rx.body).toMatchObject({
      status: 'ISSUED',
      doctor: { qualification: 'MBBS, MD', registrationNumber: 'KMC-2015/778' },
    });
    const chat = await api<ConsultationUpdates>(
      'GET',
      `/v1/consultations/${consultationId}/updates?after=0`,
      patient.accessToken,
    );
    expect(chat.body.messages.map((m) => m.type)).toEqual(
      expect.arrayContaining(['TEXT', 'PRESCRIPTION_CARD']),
    );
    expect((await api('POST', `/v1/consultations/${consultationId}/end`, doctor.accessToken)).status).toBe(
      200,
    );

    // 6. The patient orders from the prescription (cash on delivery).
    const order = await api<Order>('POST', '/v1/orders', patient.accessToken, {
      prescriptionId: rx.body.id,
      pharmacyId,
      address: { fullName: 'Ramesh Kumar', phone: '9811100002', addressLine: 'House 12', district: 'Almora' },
      items: [{ prescriptionItemId: rx.body.items[0]!.id, medicineId, quantity: 10 }],
      idempotencyKey: randomUUID(),
    });
    expect(order.status).toBe(201);
    expect(order.body.trackingId).toMatch(/^TC-[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    // 7. The pharmacy moves it along; the patient's tracking shows each step.
    const pharmacy = await provisioned('PHARMACY_ADMIN');
    for (const status of ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'])
      expect((await api('POST', `/v1/orders/${order.body.id}/status`, pharmacy, { status })).status).toBe(
        200,
      );
    const tracked = await api<Order>('GET', `/v1/orders/track/${order.body.trackingId}`, patient.accessToken);
    expect(tracked.body.status).toBe('DELIVERED');
    // Tracking holds the address and medicines: never public, never another patient's.
    expect((await api('GET', `/v1/orders/track/${order.body.trackingId}`)).status).toBe(401);
    const stranger = (
      await api<AuthSession>('POST', '/v1/auth/register', undefined, {
        fullName: 'Someone Else',
        phone: randomPhone(),
        password: PASSWORD,
        consent: true,
      })
    ).body;
    expect((await api('GET', `/v1/orders/track/${order.body.trackingId}`, stranger.accessToken)).status).toBe(
      404,
    );
    // A route guarded only by requireRole still demands a login (it used to crash with 500).
    expect((await api('POST', '/v1/orders', undefined, {})).status).toBe(401);

    // 8. The doctor's dashboard counts the completed consultation and its fee.
    const stats = await api<DoctorStats>('GET', '/v1/me/doctor-stats', doctor.accessToken);
    expect(stats.body).toMatchObject({ completed: 1, earningsInr: 250 });
  });
});
