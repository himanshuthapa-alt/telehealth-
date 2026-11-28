import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Appointment, AuthSession, JoinResponse, Order, Prescription, Role } from '@telecare/shared';
import { hashPassword } from '../src/modules/auth/passwords';
import { medicines, pharmacies } from '../src/modules/pharmacy/pharmacy.schema';
import { doctorProfiles } from '../src/modules/users/doctor-profile.schema';
import { users } from '../src/modules/users/users.schema';
import { listen, randomPhone, testApp, testDatabase } from './helpers';

/** Orders through the real HTTP API (blueprint D9, §14, §15): rules, permissions, races. */

const { db } = testDatabase();
const PASSWORD = 'green-mango-42';
const PASSWORD_HASH = hashPassword(PASSWORD);
// Mon 7 Apr 2031: no other test file's sweep reaches it.
const ist = (hhmm: string) => new Date(`2031-04-07T${hhmm}:00+05:30`);
let clock = ist('08:00');
const TAG = `zo${randomUUID().slice(0, 8)}`;
let server: Awaited<ReturnType<typeof listen>>;
let pharmacyId: string;
let paracetamol: string; // over the counter
let amoxicillin: string; // prescription only
let pharmacist: string;

async function api<T = unknown>(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: (text ? JSON.parse(text) : undefined) as T & { error: { code: string } },
  };
}

async function user(role: Role) {
  const phone = randomPhone();
  const [u] = await db
    .insert(users)
    .values({ phone, fullName: `${role} ${phone.slice(-4)}`, role, passwordHash: await PASSWORD_HASH })
    .returning({ id: users.id });
  if (role === 'DOCTOR')
    await db.insert(doctorProfiles).values({
      userId: u!.id,
      specializations: ['General Physician'],
      languages: ['Hindi'],
      experienceYears: 5,
      feeInr: 200,
    });
  const login = await api<AuthSession>('POST', '/v1/auth/login', undefined, { phone, password: PASSWORD });
  return { id: u!.id, token: login.body.accessToken };
}

async function addMedicine(name: string, stockQty: number, requiresPrescription: boolean) {
  const [m] = await db
    .insert(medicines)
    .values({
      pharmacyId,
      name: `${name} ${TAG}`,
      genericName: name,
      form: 'TABLET',
      strength: '500 mg',
      packSize: '10 tablets',
      pricePaise: 3000,
      stockQty,
      requiresPrescription,
    })
    .returning({ id: medicines.id });
  return m!.id;
}

/** A patient with an issued prescription: 10 paracetamol + 6 amoxicillin. Each call uses its own hour. */
let hour = 9;
async function patientWithPrescription() {
  const slot = `${String(hour++).padStart(2, '0')}:00`;
  clock = ist('07:00');
  const doctor = await user('DOCTOR');
  const patient = await user('PATIENT');
  await api('PUT', '/v1/availability/rules', doctor.token, {
    rules: [{ weekday: 1, startTime: '08:00', endTime: '20:00', slotMinutes: 30 }],
  });
  const res = await fetch(`${server.url}/v1/appointments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${patient.token}`,
      'idempotency-key': randomUUID(),
    },
    body: JSON.stringify({ doctorId: doctor.id, startAt: ist(slot).toISOString() }),
  });
  const booking = (await res.json()) as Appointment;
  clock = new Date(ist(slot).getTime() - 5 * 60_000);
  const joined = await api<JoinResponse>('POST', `/v1/appointments/${booking.id}/join`, patient.token);
  await api('POST', `/v1/appointments/${booking.id}/join`, doctor.token);
  const cid = joined.body.consultation.id;
  await api('POST', `/v1/consultations/${cid}/start`, doctor.token);
  const draft = await api<Prescription>('POST', `/v1/consultations/${cid}/prescription`, doctor.token);
  const item = (medicineId: string, medicineName: string, quantity: number) => ({
    medicineId,
    medicineName,
    dosage: '1 tablet',
    frequency: 'TWICE_A_DAY',
    durationDays: 5,
    quantity,
    instructions: null,
  });
  await api('PUT', `/v1/prescriptions/${draft.body.id}`, doctor.token, {
    items: [item(paracetamol, `Paracetamol ${TAG}`, 10), item(amoxicillin, `Amoxicillin ${TAG}`, 6)],
    generalInstructions: null,
    validDays: 30,
  });
  const rx = (await api<Prescription>('POST', `/v1/prescriptions/${draft.body.id}/issue`, doctor.token)).body;
  return { patient, rx, para: rx.items[0]!, amox: rx.items[1]! };
}

const address = {
  fullName: 'Ramesh Kumar',
  phone: '9811100002',
  addressLine: 'House 12',
  district: 'Almora',
};
const order = (token: string, body: Record<string, unknown>) =>
  api<Order>('POST', '/v1/orders', token, { pharmacyId, address, idempotencyKey: randomUUID(), ...body });

beforeAll(async () => {
  server = await listen(testApp({ now: () => clock }).app);
  const [p] = await db
    .insert(pharmacies)
    .values({ name: `Orders pharmacy ${TAG}`, address: 'Test' })
    .returning();
  pharmacyId = p!.id;
  paracetamol = await addMedicine('Paracetamol', 100, false);
  amoxicillin = await addMedicine('Amoxicillin', 100, true);
  pharmacist = (await user('PHARMACY_ADMIN')).token;
});
afterAll(() => server.close());

describe('placing an order', () => {
  it('orders from a prescription within the prescribed quantity, and refuses more', async () => {
    const { patient, rx, para } = await patientWithPrescription();
    const ok = await order(patient.token, {
      prescriptionId: rx.id,
      items: [{ prescriptionItemId: para.id, medicineId: paracetamol, quantity: 6 }],
    });
    expect(ok.status).toBe(201);
    const tooMany = await order(patient.token, {
      prescriptionId: rx.id,
      items: [{ prescriptionItemId: para.id, medicineId: paracetamol, quantity: 5 }],
    });
    expect(tooMany.body.error.code).toBe('QUANTITY_EXCEEDS_PRESCRIPTION');
  });

  it('a prescription-only medicine needs a prescription', async () => {
    const { patient } = await patientWithPrescription();
    const res = await order(patient.token, { items: [{ medicineId: amoxicillin, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PRESCRIPTION_REQUIRED');
    // Over-the-counter medicines can be ordered directly.
    expect((await order(patient.token, { items: [{ medicineId: paracetamol, quantity: 1 }] })).status).toBe(
      201,
    );
  });

  it("a prescription line can't be used to order a different medicine", async () => {
    const { patient, rx, para } = await patientWithPrescription();
    const swapped = await order(patient.token, {
      prescriptionId: rx.id,
      items: [{ prescriptionItemId: para.id, medicineId: amoxicillin, quantity: 1 }],
    });
    expect(swapped.body.error.code).toBe('INVALID_PRESCRIPTION_ITEM');
    const noRx = await order(patient.token, {
      items: [{ prescriptionItemId: para.id, medicineId: paracetamol, quantity: 1 }],
    });
    expect(noRx.status).toBe(400);
  });

  it('two orders at the same moment cannot exceed the prescription together', async () => {
    const { patient, rx, amox } = await patientWithPrescription();
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        order(patient.token, {
          prescriptionId: rx.id,
          items: [{ prescriptionItemId: amox.id, medicineId: amoxicillin, quantity: 4 }],
        }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1); // 4 + 4 > 6 prescribed
  });

  it('never sells more than is in stock, even under concurrent orders', async () => {
    const scarce = await addMedicine('Cetirizine', 3, false);
    const buyers = await Promise.all([1, 2, 3, 4].map(() => user('PATIENT')));
    const results = await Promise.all(
      buyers.map((b) => order(b.token, { items: [{ medicineId: scarce, quantity: 1 }] })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.find((r) => r.status !== 201)!.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('the same idempotency key returns the same order once', async () => {
    const { patient } = await patientWithPrescription();
    const key = randomUUID();
    const body = { items: [{ medicineId: paracetamol, quantity: 1 }], idempotencyKey: key };
    const a = await order(patient.token, body);
    const b = await order(patient.token, body);
    expect(b.body.id).toBe(a.body.id);
  });
});

describe('who can see and change an order', () => {
  it("other patients get 404; doctors can't create orders", async () => {
    const { patient } = await patientWithPrescription();
    const mine = await order(patient.token, { items: [{ medicineId: paracetamol, quantity: 1 }] });
    const other = await user('PATIENT');
    expect((await api('GET', `/v1/orders/${mine.body.id}`, other.token)).status).toBe(404);
    expect((await api('GET', '/v1/orders', other.token)).body).toEqual([]);
    const doctor = await user('DOCTOR');
    expect((await order(doctor.token, { items: [{ medicineId: paracetamol, quantity: 1 }] })).status).toBe(
      403,
    );
  });

  it('patient cancels only while PENDING; stock comes back; pharmacy cancel needs a reason', async () => {
    const { patient } = await patientWithPrescription();
    const stock = async () =>
      (await api<{ stockQty: number }[]>('GET', `/v1/medicines?q=Paracetamol ${TAG}`, pharmacist)).body[0]!
        .stockQty;
    const before = await stock();
    const a = await order(patient.token, { items: [{ medicineId: paracetamol, quantity: 2 }] });
    expect(await stock()).toBe(before - 2);
    expect(
      (await api('POST', `/v1/orders/${a.body.id}/status`, patient.token, { status: 'CANCELLED' })).status,
    ).toBe(200);
    expect(await stock()).toBe(before);

    const b = await order(patient.token, { items: [{ medicineId: paracetamol, quantity: 1 }] });
    await api('POST', `/v1/orders/${b.body.id}/status`, pharmacist, { status: 'CONFIRMED' });
    expect(
      (await api('POST', `/v1/orders/${b.body.id}/status`, patient.token, { status: 'CANCELLED' })).status,
    ).toBe(409);
    expect(
      (await api('POST', `/v1/orders/${b.body.id}/status`, pharmacist, { status: 'CANCELLED' })).status,
    ).toBe(400);
    expect(
      (
        await api('POST', `/v1/orders/${b.body.id}/status`, pharmacist, {
          status: 'CANCELLED',
          cancelReason: 'Out of stock at the counter',
        })
      ).status,
    ).toBe(200);
    // Skipping a step is refused.
    const c = await order(patient.token, { items: [{ medicineId: paracetamol, quantity: 1 }] });
    expect(
      (await api('POST', `/v1/orders/${c.body.id}/status`, pharmacist, { status: 'SHIPPED' })).status,
    ).toBe(409);
  });
});
