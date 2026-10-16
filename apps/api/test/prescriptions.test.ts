import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Appointment,
  AuthSession,
  ConsultationUpdates,
  JoinResponse,
  MedicineSummary,
  Prescription,
  PrescriptionCardBody,
  PrescriptionItemInput,
  Role,
  SavePrescriptionRequest,
} from '@telecare/shared';
import { hashPassword } from '../src/modules/auth/passwords';
import { medicines, pharmacies } from '../src/modules/pharmacy/pharmacy.schema';
import { prescriptionItems, prescriptions } from '../src/modules/prescriptions/prescriptions.schema';
import { doctorProfiles } from '../src/modules/users/doctor-profile.schema';
import { users } from '../src/modules/users/users.schema';
import { listen, randomPhone, testApp, testDatabase } from './helpers';

const { db } = testDatabase();
const PASSWORD = 'green-mango-42';
// Hashed once per file: argon2 is slow on purpose, and test accounts don't need their own hash.
const PASSWORD_HASH = hashPassword(PASSWORD);
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  startTime: '09:00',
  endTime: '13:00',
  slotMinutes: 30,
}));
// Mon 4 Jun 2029: after the consultation tests' sweep date (1 Jan 2029), so it never touches this file's rows.
const ist = (hhmm: string, date = '2029-06-04') => new Date(`${date}T${hhmm}:00+05:30`);

let clock = ist('08:00');
type Server = Awaited<ReturnType<typeof listen>>;
let server: Server;

async function api<T = unknown>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: (text ? JSON.parse(text) : undefined) as T & {
      error: { code: string; details?: { fields?: Record<string, string> } };
    },
  };
}

async function makeUser(role: Role) {
  const phone = randomPhone();
  const [user] = await db
    .insert(users)
    .values({ phone, fullName: `${role} ${phone.slice(-4)}`, role, passwordHash: await PASSWORD_HASH })
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

/** A consultation in progress: booked for 10:00, both joined at 09:55, doctor started. */
async function activeConsultation() {
  clock = ist('08:00');
  const doctor = await makeUser('DOCTOR');
  const patient = await makeUser('PATIENT');
  await api('PUT', '/v1/availability/rules', doctor.token, { rules: WEEK });
  const booked = await api<Appointment>(
    'POST',
    '/v1/appointments',
    patient.token,
    { doctorId: doctor.id, startAt: ist('10:00').toISOString() },
    { 'idempotency-key': randomUUID() },
  );
  clock = ist('09:55');
  const joined = await api<JoinResponse>('POST', `/v1/appointments/${booked.body.id}/join`, patient.token);
  await api('POST', `/v1/appointments/${booked.body.id}/join`, doctor.token);
  const consultationId = joined.body.consultation.id;
  await api('POST', `/v1/consultations/${consultationId}/start`, doctor.token);
  return { doctor, patient, consultationId };
}

let paracetamol: MedicineSummary;
const items = (): PrescriptionItemInput[] => [
  {
    medicineId: paracetamol.id,
    medicineName: paracetamol.name,
    dosage: '1 tablet',
    frequency: 'THREE_TIMES_A_DAY',
    durationDays: 3,
    quantity: 9,
    instructions: 'After food',
  },
  {
    medicineId: null,
    medicineName: 'Steam inhalation',
    dosage: '10 minutes',
    frequency: 'TWICE_A_DAY',
    durationDays: 5,
    quantity: 1,
    instructions: null,
  },
];
const save = (
  token: string,
  id: string,
  body: SavePrescriptionRequest = {
    items: items(),
    generalInstructions: 'Drink plenty of water.',
    validDays: 30,
  },
) => api<Prescription>('PUT', `/v1/prescriptions/${id}`, token, body);

/** A draft with content, issued. */
async function issued() {
  const ctx = await activeConsultation();
  const draft = await api<Prescription>(
    'POST',
    `/v1/consultations/${ctx.consultationId}/prescription`,
    ctx.doctor.token,
  );
  await save(ctx.doctor.token, draft.body.id);
  const res = await api<Prescription>('POST', `/v1/prescriptions/${draft.body.id}/issue`, ctx.doctor.token);
  expect(res.status).toBe(200);
  return { ...ctx, prescription: res.body };
}

beforeAll(async () => {
  server = await listen(testApp({ now: () => clock }).app);
  // This file's own pharmacy and medicines: tests never rely on seed data.
  const [pharmacy] = await db
    .insert(pharmacies)
    .values({ name: `Test pharmacy ${randomUUID()}`, address: 'Test' })
    .returning();
  const [medicine] = await db
    .insert(medicines)
    .values({
      pharmacyId: pharmacy!.id,
      name: 'Paracetamol 500 mg',
      genericName: 'Paracetamol',
      form: 'TABLET',
      pricePaise: 2500,
      stockQty: 10,
    })
    .returning({ id: medicines.id, name: medicines.name });
  await db.insert(medicines).values({
    pharmacyId: pharmacy!.id,
    name: 'Vitamin D3 60,000 IU',
    genericName: 'Cholecalciferol',
    form: 'CAPSULE',
    pricePaise: 12000,
  });
  paracetamol = { id: medicine!.id, name: medicine!.name } as MedicineSummary;
});
afterAll(() => server.close());

describe('medicine catalog', () => {
  it('searches by name or generic name and shows availability, not exact stock', async () => {
    const someone = await makeUser('PATIENT');
    const res = await api<MedicineSummary[]>('GET', '/v1/medicines?q=CHOLECALCIFEROL', someone.token);
    expect(res.body.map((m) => m.name)).toEqual(expect.arrayContaining(['Vitamin D3 60,000 IU']));
    expect(res.body[0]).not.toHaveProperty('stockQty');
    expect(typeof res.body[0]!.inStock).toBe('boolean');
  });
});

describe('writing a prescription', () => {
  it('the doctor opens one draft per consultation and fills it with catalog and free-text medicines', async () => {
    const { doctor, consultationId } = await activeConsultation();
    const draft = await api<Prescription>(
      'POST',
      `/v1/consultations/${consultationId}/prescription`,
      doctor.token,
    );
    expect(draft.body).toMatchObject({ status: 'DRAFT', items: [], validDays: 30 });
    const again = await api<Prescription>(
      'POST',
      `/v1/consultations/${consultationId}/prescription`,
      doctor.token,
    );
    expect(again.body.id).toBe(draft.body.id);

    const saved = await save(doctor.token, draft.body.id);
    expect(saved.body.items.map((i) => [i.medicineName, i.inCatalog])).toEqual([
      ['Paracetamol 500 mg', true],
      ['Steam inhalation', false],
    ]);
    expect(saved.body.generalInstructions).toBe('Drink plenty of water.');
  });

  it('rejects unknown medicines, odd frequencies and impossible quantities', async () => {
    const { doctor, consultationId } = await activeConsultation();
    const { body } = await api<Prescription>(
      'POST',
      `/v1/consultations/${consultationId}/prescription`,
      doctor.token,
    );
    const bad = (patch: Partial<PrescriptionItemInput>) =>
      save(doctor.token, body.id, {
        items: [{ ...items()[0]!, ...patch }],
        generalInstructions: null,
        validDays: 30,
      });
    expect((await bad({ medicineId: randomUUID() })).status).toBe(400);
    expect((await bad({ frequency: 'EVERY_FULL_MOON' as never })).status).toBe(400);
    expect((await bad({ quantity: 0 })).status).toBe(400);
  });

  it('only during the consultation or within 24 hours after it', async () => {
    const { doctor, consultationId } = await activeConsultation();
    clock = ist('10:20');
    await api('POST', `/v1/consultations/${consultationId}/end`, doctor.token);
    clock = new Date(ist('10:20').getTime() + 23 * 3_600_000);
    expect((await api('POST', `/v1/consultations/${consultationId}/prescription`, doctor.token)).status).toBe(
      200,
    );
    clock = new Date(ist('10:20').getTime() + 25 * 3_600_000);
    const late = await api('POST', `/v1/consultations/${consultationId}/prescription`, doctor.token);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('PRESCRIBE_WINDOW_CLOSED');
  });

  it('patients cannot write prescriptions, and drafts are invisible to them', async () => {
    const { doctor, patient, consultationId } = await activeConsultation();
    expect(
      (await api('POST', `/v1/consultations/${consultationId}/prescription`, patient.token)).status,
    ).toBe(403);
    const { body } = await api<Prescription>(
      'POST',
      `/v1/consultations/${consultationId}/prescription`,
      doctor.token,
    );
    expect((await api('GET', `/v1/prescriptions/${body.id}`, patient.token)).status).toBe(404);
    expect((await api<Prescription[]>('GET', '/v1/prescriptions', patient.token)).body).toEqual([]);
  });
});

describe('issuing', () => {
  it('needs at least one medicine', async () => {
    const { doctor, consultationId } = await activeConsultation();
    const { body } = await api<Prescription>(
      'POST',
      `/v1/consultations/${consultationId}/prescription`,
      doctor.token,
    );
    const res = await api('POST', `/v1/prescriptions/${body.id}/issue`, doctor.token);
    expect(res.status).toBe(400);
    expect(res.body.error.details!.fields).toHaveProperty('items');
  });

  it('locks it, sets 30 days of validity, posts a card into the chat, and the patient can see it', async () => {
    const { patient, consultationId, prescription } = await issued();
    expect(prescription).toMatchObject({
      status: 'ISSUED',
      validUntil: '2029-07-04',
      issuedAt: ist('09:55').toISOString(),
    });

    const chat = await api<ConsultationUpdates>(
      'GET',
      `/v1/consultations/${consultationId}/updates`,
      patient.token,
    );
    const card = chat.body.messages.find((m) => m.type === 'PRESCRIPTION_CARD')!;
    expect(JSON.parse(card.body) as PrescriptionCardBody).toEqual({
      prescriptionId: prescription.id,
      itemCount: 2,
    });

    expect(
      (await api<Prescription>('GET', `/v1/prescriptions/${prescription.id}`, patient.token)).body.items,
    ).toHaveLength(2);
    expect(
      (await api<Prescription[]>('GET', '/v1/prescriptions', patient.token)).body.map((p) => p.id),
    ).toEqual([prescription.id]);
  });
});

describe('IMMUTABILITY', () => {
  it('the API refuses to change an issued prescription', async () => {
    const { doctor, prescription } = await issued();
    const edit = await save(doctor.token, prescription.id);
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe('PRESCRIPTION_LOCKED');
    expect(
      (await api('POST', `/v1/prescriptions/${prescription.id}/issue`, doctor.token)).body.error.code,
    ).toBe('PRESCRIPTION_LOCKED');
  });

  it('the DATABASE refuses it too, even for code that bypasses the API', async () => {
    const { prescription } = await issued();
    await expect(
      db
        .update(prescriptions)
        .set({ generalInstructions: 'tampered' })
        .where(eq(prescriptions.id, prescription.id)),
    ).rejects.toThrow();
    await expect(
      db.update(prescriptions).set({ status: 'DRAFT' }).where(eq(prescriptions.id, prescription.id)),
    ).rejects.toThrow();
    await expect(db.delete(prescriptions).where(eq(prescriptions.id, prescription.id))).rejects.toThrow();
    await expect(
      db
        .update(prescriptionItems)
        .set({ quantity: 999 })
        .where(eq(prescriptionItems.prescriptionId, prescription.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, prescription.id)),
    ).rejects.toThrow();
    await expect(
      db.insert(prescriptionItems).values({
        prescriptionId: prescription.id,
        position: 9,
        medicineName: 'Extra',
        dosage: '1',
        frequency: 'ONCE_A_DAY',
        durationDays: 1,
        quantity: 1,
      }),
    ).rejects.toThrow();
  });

  it('a correction is a void (with a reason) plus a new draft that points back; the old one never changes again', async () => {
    const { doctor, patient, prescription } = await issued();
    expect(
      (await api('POST', `/v1/prescriptions/${prescription.id}/void`, doctor.token, { reason: 'x' })).status,
    ).toBe(400);

    const res = await api<{ voided: Prescription; draft: Prescription }>(
      'POST',
      `/v1/prescriptions/${prescription.id}/void`,
      doctor.token,
      {
        reason: 'Wrong dose',
        revise: true,
      },
    );
    expect(res.body.voided).toMatchObject({ status: 'VOIDED', voidReason: 'Wrong dose' });
    expect(res.body.draft).toMatchObject({ status: 'DRAFT', supersedesId: prescription.id });
    expect(res.body.draft.items.map((i) => i.medicineName)).toEqual([
      'Paracetamol 500 mg',
      'Steam inhalation',
    ]);

    await expect(
      db
        .update(prescriptions)
        .set({ voidReason: 'edited later' })
        .where(eq(prescriptions.id, prescription.id)),
    ).rejects.toThrow();
    expect(
      (await api<Prescription>('GET', `/v1/prescriptions/${prescription.id}`, patient.token)).body.status,
    ).toBe('VOIDED');
    expect(
      (await api<Prescription>('POST', `/v1/prescriptions/${res.body.draft.id}/issue`, doctor.token)).body
        .status,
    ).toBe('ISSUED');
  });

  it('only one prescription is in force per consultation: void the old one first', async () => {
    const { doctor, consultationId } = await issued();
    const second = await api<Prescription>(
      'POST',
      `/v1/consultations/${consultationId}/prescription`,
      doctor.token,
    );
    await save(doctor.token, second.body.id);
    const res = await api('POST', `/v1/prescriptions/${second.body.id}/issue`, doctor.token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });
});

describe('OWNERSHIP', () => {
  it("other patients and other doctors can't see, change or void it (404, as if it didn't exist)", async () => {
    const { prescription, consultationId } = await issued();
    const otherPatient = await makeUser('PATIENT');
    const otherDoctor = await makeUser('DOCTOR');
    const pharmacy = await makeUser('PHARMACY_ADMIN');

    expect((await api('GET', `/v1/prescriptions/${prescription.id}`, otherPatient.token)).status).toBe(404);
    expect((await api('GET', `/v1/prescriptions/${prescription.id}`, otherDoctor.token)).status).toBe(404);
    expect((await api('GET', `/v1/prescriptions/${prescription.id}`, pharmacy.token)).status).toBe(403);
    expect(
      (
        await api('POST', `/v1/prescriptions/${prescription.id}/void`, otherDoctor.token, {
          reason: 'Not mine',
        })
      ).status,
    ).toBe(404);
    expect(
      (await api('POST', `/v1/consultations/${consultationId}/prescription`, otherDoctor.token)).status,
    ).toBe(404);
    expect((await api<Prescription[]>('GET', '/v1/prescriptions', otherPatient.token)).body).toEqual([]);
  });
});
