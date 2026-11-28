import { jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { createHmsVideoProvider } from '../src/modules/consultations/video';

const SECRET = 'hms-test-secret-hms-test-secret-123456';
const key = new TextEncoder().encode(SECRET);

function provider() {
  const calls: { url: string; auth: string; body: unknown }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      auth: String((init.headers as Record<string, string>).authorization),
      body: JSON.parse(String(init.body)),
    });
    return new Response(JSON.stringify({ id: 'room-123' }), { status: 200 });
  }) as typeof fetch;
  const hms = createHmsVideoProvider({
    accessKey: 'ak',
    appSecret: SECRET,
    templateId: 'tpl',
    roles: { doctor: 'host', patient: 'guest' },
    fetch: fakeFetch,
  });
  return { hms, calls };
}

describe('100ms video provider', () => {
  it('creates a named room with a signed management token', async () => {
    const { hms, calls } = provider();
    expect(await hms.createRoom('c1')).toEqual({ roomId: 'room-123' });
    expect(calls[0]!.url).toBe('https://api.100ms.live/v2/rooms');
    expect(calls[0]!.body).toEqual({ name: 'telecare-c1', template_id: 'tpl' });
    const { payload } = await jwtVerify(calls[0]!.auth.replace('Bearer ', ''), key);
    expect(payload).toMatchObject({ access_key: 'ak', type: 'management', version: 2 });
    expect(payload.jti).toBeTruthy();
  });

  it('issues app tokens with the template role for each side', async () => {
    const { hms } = provider();
    const doctor = await hms.issueJoinToken('room-123', 'u1', 'DOCTOR', 60);
    const patient = await hms.issueJoinToken('room-123', 'u2', 'PATIENT', 60);
    const d = (await jwtVerify(doctor.token, key)).payload;
    expect(d).toMatchObject({ type: 'app', room_id: 'room-123', user_id: 'u1', role: 'host', version: 2 });
    expect((await jwtVerify(patient.token, key)).payload.role).toBe('guest');
    expect(d.exp! - d.iat!).toBe(60);
  });

  it('disables the room when the consultation ends', async () => {
    const { hms, calls } = provider();
    await hms.endRoom('room-123');
    expect(calls[0]).toMatchObject({
      url: 'https://api.100ms.live/v2/rooms/room-123',
      body: { enabled: false },
    });
  });
});
