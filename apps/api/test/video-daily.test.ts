import { describe, expect, it } from 'vitest';
import { createDailyVideoProvider } from '../src/modules/consultations/video';

/** Daily adapter against a fake Daily API: private rooms, owner tokens, reuse, delete. */
describe('Daily video provider', () => {
  const rooms = new Map<string, string>();
  const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.daily.co/v1', '');
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method: init.method!, path, body });
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key');
    if (init.method === 'POST' && path === '/rooms') {
      if (rooms.has(body.name)) return json({ error: 'invalid-request-error', info: 'already exists' }, 400);
      rooms.set(body.name, `https://demo.daily.co/${body.name}`);
      return json({ name: body.name, url: rooms.get(body.name) });
    }
    if (init.method === 'GET') return json({ url: rooms.get(path.split('/').pop()!) });
    if (path === '/meeting-tokens') return json({ token: 'tok-' + body.properties.user_id });
    if (init.method === 'DELETE') return json({ deleted: true });
    return json({}, 404);
  }) as typeof fetch;
  const daily = createDailyVideoProvider({ apiKey: 'key', fetch: fakeFetch });

  it('creates one private, self-expiring room per consultation, even when both join at once', async () => {
    const a = await daily.createRoom('c1');
    const b = await daily.createRoom('c1');
    expect(a.roomId).toBe('https://demo.daily.co/telecare-c1');
    expect(b.roomId).toBe(a.roomId);
    expect(calls[0]!.body).toMatchObject({ privacy: 'private', properties: { eject_at_room_exp: true } });
  });

  it('only the doctor joins as owner; tokens expire', async () => {
    const before = Math.floor(Date.now() / 1000);
    await daily.issueJoinToken('https://demo.daily.co/telecare-c1', 'doc', 'DOCTOR', 600);
    await daily.issueJoinToken('https://demo.daily.co/telecare-c1', 'pat', 'PATIENT', 600);
    const [doc, pat] = calls
      .filter((c) => c.path === '/meeting-tokens')
      .map((c) => c.body!.properties as Record<string, unknown>);
    expect(doc).toMatchObject({ room_name: 'telecare-c1', is_owner: true });
    expect(pat).toMatchObject({ is_owner: false });
    expect(pat!.exp).toBeGreaterThanOrEqual(before + 600);
  });

  it('ending deletes the room', async () => {
    await daily.endRoom('https://demo.daily.co/telecare-c1');
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/rooms/telecare-c1' });
  });
});
