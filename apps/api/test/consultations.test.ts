import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  Appointment,
  AuthSession,
  ChatMessage,
  Consultation,
  ConsultationUpdates,
  JoinResponse,
  Role,
} from '@telecare/shared';
import type { SweepConsultations } from '../src/app';
import { appointments } from '../src/modules/appointments/appointments.schema';
import { auditEvents } from '../src/modules/audit/audit.schema';
import { hashPassword } from '../src/modules/auth/passwords';
import { consultationEvents } from '../src/modules/consultations/consultations.schema';
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
// Mon 1 Jan 2029: a year before the booking tests' dates, so this file's sweep (which closes
// everything whose window has passed) can never touch their appointments while they run in parallel.
const ist = (hhmm: string, date = '2029-01-01') => new Date(`${date}T${hhmm}:00+05:30`);

// A clock the tests can move: booking happens at 08:00 IST, then time jumps to the consultation.
let clock = ist('08:00');
type Server = Awaited<ReturnType<typeof listen>>;
let server: Server;
let chatOnly: Server;
let sweep: SweepConsultations;

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
      error: { code: string; details?: Record<string, string> };
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

async function makeUser(role: Role) {
  const phone = randomPhone();
  const [user] = await db
    .insert(users)
    .values({
      phone,
      fullName: `${role} ${phone.slice(-4)}`,
      role,
      passwordHash: await PASSWORD_HASH,
    })
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

/** A patient booked with a doctor at 10:00–10:30 IST on Mon 1 Jan 2029. */
async function bookedPair() {
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
  expect(booked.status).toBe(201);
  return { doctor, patient, appointmentId: booked.body.id };
}

const join = (token: string, appointmentId: string, base = server) =>
  call<JoinResponse>(base, 'POST', `/v1/appointments/${appointmentId}/join`, token);
const send = (token: string, consultationId: string, body: string, clientMsgId = randomUUID()) =>
  api<ChatMessage>('POST', `/v1/consultations/${consultationId}/messages`, token, { clientMsgId, body });
const updates = (token: string, consultationId: string, after = 0, wait = 0) =>
  api<ConsultationUpdates>(
    'GET',
    `/v1/consultations/${consultationId}/updates?after=${after}&wait=${wait}`,
    token,
  );

beforeAll(async () => {
  const built = testApp({ now: () => clock });
  sweep = built.app.locals.sweepConsultations as SweepConsultations;
  server = await listen(built.app);
  chatOnly = await listen(testApp({ now: () => clock, video: null }).app);
});
afterAll(async () => {
  await server.close();
  await chatOnly.close();
});
beforeEach(() => {
  clock = ist('08:00');
});

describe('joining', () => {
  it('opens 10 minutes before the start; the first join creates a WAITING consultation with a video token', async () => {
    const { patient, appointmentId } = await bookedPair();
    clock = ist('09:49');
    const early = await join(patient.token, appointmentId);
    expect(early.status).toBe(409);
    expect(early.body.error).toMatchObject({
      code: 'JOIN_NOT_OPEN',
      details: { opensAt: ist('09:50').toISOString() },
    });

    clock = ist('09:50');
    const res = await join(patient.token, appointmentId);
    expect(res.status).toBe(200);
    expect(res.body.consultation).toMatchObject({
      appointmentId,
      status: 'WAITING',
      present: { patient: true, doctor: false },
    });
    expect(res.body.video).toMatchObject({ provider: 'fake' });
    expect(res.body.video!.token).toBeTruthy();
  });

  it('a stranger gets 404 and the attempt is audited', async () => {
    const { appointmentId } = await bookedPair();
    const stranger = await makeUser('PATIENT');
    clock = ist('10:00');
    expect((await join(stranger.token, appointmentId)).status).toBe(404);
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.actorId, stranger.id), eq(auditEvents.action, 'CONSULTATION_JOIN_DENIED')));
    expect(event!.entityId).toBe(appointmentId);
  });

  it('a cancelled appointment or a closed window cannot be joined', async () => {
    const { patient, appointmentId } = await bookedPair();
    await api('POST', `/v1/appointments/${appointmentId}/cancel`, patient.token, {});
    clock = ist('10:00');
    expect((await join(patient.token, appointmentId)).body.error.code).toBe('CONSULTATION_CLOSED');

    const other = await bookedPair();
    clock = ist('10:45'); // end 10:30 + 15 min grace
    expect((await join(other.patient.token, other.appointmentId)).body.error.code).toBe(
      'CONSULTATION_CLOSED',
    );
  });

  it('joining again is a rejoin (same consultation, new token) and leaving clears presence', async () => {
    const { patient, doctor, appointmentId } = await bookedPair();
    clock = ist('10:00');
    const first = await join(patient.token, appointmentId);
    const again = await join(patient.token, appointmentId);
    expect(again.body.consultation.id).toBe(first.body.consultation.id);
    expect(again.body.video!.token).not.toBe(first.body.video!.token);
    const events = await db
      .select({ type: consultationEvents.type })
      .from(consultationEvents)
      .where(eq(consultationEvents.consultationId, first.body.consultation.id));
    expect(events.map((e) => e.type)).toEqual(['JOINED', 'RECONNECTED']);

    const id = first.body.consultation.id;
    await api('POST', `/v1/consultations/${id}/leave`, patient.token);
    expect((await updates(doctor.token, id)).body.consultation.present.patient).toBe(false);
  });
});

describe('lifecycle', () => {
  it('only the doctor starts and ends; ending completes the appointment and closes the room', async () => {
    const { patient, doctor, appointmentId } = await bookedPair();
    clock = ist('09:55');
    const id = (await join(patient.token, appointmentId)).body.consultation.id;
    await join(doctor.token, appointmentId);

    expect((await api('POST', `/v1/consultations/${id}/start`, patient.token)).status).toBe(403);
    const started = await api<Consultation>('POST', `/v1/consultations/${id}/start`, doctor.token);
    expect(started.body).toMatchObject({ status: 'ACTIVE', present: { patient: true, doctor: true } });
    expect((await api('POST', `/v1/consultations/${id}/start`, doctor.token)).body.error.code).toBe(
      'INVALID_STATE',
    );

    expect((await api('POST', `/v1/consultations/${id}/end`, patient.token)).status).toBe(403);
    const ended = await api<Consultation>('POST', `/v1/consultations/${id}/end`, doctor.token);
    expect(ended.body.status).toBe('COMPLETED');

    const [row] = await db
      .select({ status: appointments.status })
      .from(appointments)
      .where(eq(appointments.id, appointmentId));
    expect(row!.status).toBe('COMPLETED');
    expect((await join(patient.token, appointmentId)).body.error.code).toBe('CONSULTATION_CLOSED');
    expect((await send(patient.token, id, 'hello?')).body.error.code).toBe('CONSULTATION_CLOSED');

    const chat = await updates(patient.token, id);
    expect(chat.body.messages.map((m) => m.body)).toEqual([
      'The doctor started the consultation.',
      'The consultation has ended.',
    ]);
    expect(chat.body.messages.every((m) => m.type === 'SYSTEM' && m.senderId === null)).toBe(true);
  });
});

describe('chat', () => {
  it('delivers messages in order, never twice, and only to the two people in it', async () => {
    const { patient, doctor, appointmentId } = await bookedPair();
    clock = ist('10:00');
    const id = (await join(patient.token, appointmentId)).body.consultation.id;

    const key = randomUUID();
    const first = await send(patient.token, id, 'I have had fever for 3 days', key);
    const retry = await send(patient.token, id, 'I have had fever for 3 days', key); // the app retried after a timeout
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);
    await send(doctor.token, id, 'Any cough?');

    const all = await updates(doctor.token, id);
    expect(all.body.messages.map((m) => m.body)).toEqual(['I have had fever for 3 days', 'Any cough?']);
    const newer = await updates(patient.token, id, first.body.id);
    expect(newer.body.messages.map((m) => m.body)).toEqual(['Any cough?']);
    expect(newer.body.cursor).toBe(all.body.cursor);

    const stranger = await makeUser('DOCTOR');
    expect((await updates(stranger.token, id)).status).toBe(404);
    expect((await send(stranger.token, id, 'hi')).status).toBe(404);
    expect((await send(patient.token, id, '   ')).status).toBe(400);
  });

  it('LONG POLL: a waiting request returns as soon as a message arrives, and empty after the wait', async () => {
    const { patient, doctor, appointmentId } = await bookedPair();
    clock = ist('10:00');
    const id = (await join(patient.token, appointmentId)).body.consultation.id;

    const started = Date.now();
    const waiting = updates(patient.token, id, 0, 10);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await send(doctor.token, id, 'Hello, I am here');
    const res = await waiting;
    expect(res.body.messages.map((m) => m.body)).toEqual(['Hello, I am here']);
    expect(Date.now() - started).toBeLessThan(3000); // woke on the message, not after 10 s

    const quiet = await updates(patient.token, id, res.body.cursor, 1);
    expect(quiet.body.messages).toEqual([]);
    expect(quiet.body.cursor).toBe(res.body.cursor);
  });
});

describe('chat-only mode (video disabled)', () => {
  it('joins without a video token and the whole consultation runs in chat', async () => {
    const { patient, doctor, appointmentId } = await bookedPair();
    clock = ist('10:00');
    const joined = await join(patient.token, appointmentId, chatOnly);
    expect(joined.status).toBe(200);
    expect(joined.body.video).toBeNull();
    const id = joined.body.consultation.id;

    await call(chatOnly, 'POST', `/v1/appointments/${appointmentId}/join`, doctor.token);
    await call(chatOnly, 'POST', `/v1/consultations/${id}/start`, doctor.token);
    await call(chatOnly, 'POST', `/v1/consultations/${id}/messages`, patient.token, {
      clientMsgId: randomUUID(),
      body: 'Video is not working, can we chat?',
    });
    await call(chatOnly, 'POST', `/v1/consultations/${id}/messages`, doctor.token, {
      clientMsgId: randomUUID(),
      body: 'Yes. Tell me your symptoms.',
    });
    const done = await call<Consultation>(chatOnly, 'POST', `/v1/consultations/${id}/end`, doctor.token);
    expect(done.body.status).toBe('COMPLETED');
  });
});

describe('closing when the window passes', () => {
  it('in progress → COMPLETED; never started → EXPIRED + NO_SHOW; nobody joined → NO_SHOW', async () => {
    const active = await bookedPair();
    const waiting = await bookedPair();
    const unjoined = await bookedPair();
    clock = ist('10:00');
    const activeId = (await join(active.patient.token, active.appointmentId)).body.consultation.id;
    await join(active.doctor.token, active.appointmentId);
    await api('POST', `/v1/consultations/${activeId}/start`, active.doctor.token);
    const waitingId = (await join(waiting.patient.token, waiting.appointmentId)).body.consultation.id;

    clock = ist('10:45');
    expect(await sweep()).toBeGreaterThanOrEqual(3);

    const status = async (appointmentId: string) =>
      (
        await db
          .select({ s: appointments.status })
          .from(appointments)
          .where(eq(appointments.id, appointmentId))
      )[0]!.s;
    expect((await updates(active.patient.token, activeId)).body.consultation.status).toBe('COMPLETED');
    expect(await status(active.appointmentId)).toBe('COMPLETED');
    expect((await updates(waiting.patient.token, waitingId)).body.consultation.status).toBe('EXPIRED');
    expect(await status(waiting.appointmentId)).toBe('NO_SHOW');
    expect(await status(unjoined.appointmentId)).toBe('NO_SHOW');
  });
});
