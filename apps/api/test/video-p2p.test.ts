import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createP2pVideoProvider, p2pRoutes } from '../src/modules/consultations/p2p';
import { errorHandler } from '../src/platform/http/errors';
import { listen } from './helpers';

/** Free direct video: call tokens gate the page and the signal relay, per room and per person. */
const SECRET = 'x'.repeat(40);
const p2p = createP2pVideoProvider(SECRET);
let server: Awaited<ReturnType<typeof listen>>;

beforeAll(async () => {
  const app = express();
  app.use(p2pRoutes(SECRET));
  app.use(errorHandler({ error() {}, warn() {}, info() {}, debug() {} } as never));
  server = await listen(app);
});
afterAll(() => server.close());

const token = async (room: string, user: string, role: 'DOCTOR' | 'PATIENT') =>
  (await p2p.issueJoinToken(room, user, role, 600)).token;
const signal = (t: string, data: unknown) =>
  fetch(`${server.url}/v1/rtc/signal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
    body: JSON.stringify({ data }),
  });
const inbox = async (t: string) =>
  (await (
    await fetch(`${server.url}/v1/rtc/signal?after=0`, { headers: { authorization: `Bearer ${t}` } })
  ).json()) as {
    signals: { data: unknown }[];
    doctor: boolean;
  };

describe('direct (P2P) video', () => {
  it('the call page holds no secret; signalling needs a valid call token in the header', async () => {
    const doc = await token('c-1', 'doc', 'DOCTOR');
    const page = await (await fetch(`${server.url}/v1/rtc/call`)).text();
    expect(page).not.toContain(doc);
    expect((await inbox(doc)).doctor).toBe(true);
    const forged = await createP2pVideoProvider('y'.repeat(40)).issueJoinToken('c-1', 'x', 'DOCTOR', 600);
    expect((await signal(forged.token, { type: 'hello' })).status).toBe(401);
    const noToken = await fetch(`${server.url}/v1/rtc/signal?after=0`);
    expect(noToken.status).toBe(401);
  });

  it('relays signals to the other person in the same room only', async () => {
    const doc = await token('c-2', 'doc', 'DOCTOR');
    const pat = await token('c-2', 'pat', 'PATIENT');
    const stranger = await token('c-3', 'someone', 'PATIENT');
    expect((await signal(doc, { type: 'hello' })).status).toBe(204);
    expect((await inbox(pat)).signals.map((s) => s.data)).toEqual([{ type: 'hello' }]);
    expect((await inbox(doc)).signals).toEqual([]); // not your own
    expect((await inbox(stranger)).signals).toEqual([]); // not another room
  });

  it('ending the consultation clears the room', async () => {
    const doc = await token('c-4', 'doc', 'DOCTOR');
    const pat = await token('c-4', 'pat', 'PATIENT');
    await signal(doc, { type: 'hello' });
    await p2p.endRoom('c-4');
    expect((await inbox(pat)).signals).toEqual([]);
  });
});
