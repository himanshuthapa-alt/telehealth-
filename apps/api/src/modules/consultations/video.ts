import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import type { Role } from '@telecare/shared';

/**
 * The only thing the rest of the system knows about video (blueprint §13.2):
 * a room and a short-lived join token. A real vendor (Agora, ZEGOCLOUD,
 * LiveKit) is one more implementation of this interface.
 */
export interface VideoProvider {
  readonly name: string;
  createRoom(consultationId: string): Promise<{ roomId: string }>;
  issueJoinToken(
    roomId: string,
    userId: string,
    role: Role,
    ttlSeconds: number,
  ): Promise<{ token: string; expiresAt: Date }>;
  endRoom(roomId: string): Promise<void>;
}

/** Tests and demos without a video account: rooms and tokens exist, but no media flows. */
export function createFakeVideoProvider(): VideoProvider {
  return {
    name: 'fake',
    createRoom: async (consultationId) => ({ roomId: `fake-${consultationId}-${randomUUID().slice(0, 8)}` }),
    issueJoinToken: async (_roomId, _userId, _role, ttlSeconds) => ({
      token: randomBytes(24).toString('base64url'),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    }),
    endRoom: async () => undefined,
  };
}

/** VIDEO_PROVIDER=none: consultations run in chat only (blueprint §13.4). */
export const NO_VIDEO = null;

const HMS_API = 'https://api.100ms.live/v2';

export interface HmsConfig {
  accessKey: string;
  appSecret: string;
  templateId: string;
  /** Role names from the 100ms template, per app role. */
  roles: { doctor: string; patient: string };
  /** Tests pass a fake fetch. */
  fetch?: typeof fetch;
}

/**
 * 100ms (https://www.100ms.live). Rooms are created over its REST API with a
 * short management token; peers join with an app token. Both are HS256 JWTs
 * signed with the app secret, which never leaves the server.
 */
export function createHmsVideoProvider(config: HmsConfig): VideoProvider {
  const key = new TextEncoder().encode(config.appSecret);
  const doFetch = config.fetch ?? fetch;

  const sign = (claims: Record<string, unknown>, ttlSeconds: number) =>
    new SignJWT({ access_key: config.accessKey, version: 2, ...claims })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setJti(randomUUID())
      .setIssuedAt()
      .setNotBefore('0s')
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(key);

  async function call(path: string, body: unknown) {
    const res = await doFetch(`${HMS_API}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await sign({ type: 'management' }, 300)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`100ms ${path} failed: HTTP ${res.status} ${await res.text()}`);
    return (await res.json()) as { id?: string };
  }

  return {
    name: 'hms',
    async createRoom(consultationId) {
      // The name is the consultation key: 100ms updates an existing room with the same
      // name instead of creating another, so two people joining at once share one room.
      const room = await call('/rooms', {
        name: `telecare-${consultationId}`,
        template_id: config.templateId,
      });
      if (!room.id) throw new Error('100ms create room: no id in response');
      return { roomId: room.id };
    },
    async issueJoinToken(roomId, userId, role, ttlSeconds) {
      const token = await sign(
        {
          type: 'app',
          room_id: roomId,
          user_id: userId,
          role: role === 'DOCTOR' ? config.roles.doctor : config.roles.patient,
        },
        ttlSeconds,
      );
      return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
    },
    async endRoom(roomId) {
      // Disable (not just end the session) so nobody can rejoin a finished consultation.
      // Best effort: the consultation is already closed in our database, and join tokens are short-lived.
      await call(`/rooms/${encodeURIComponent(roomId)}`, { enabled: false }).catch(() => undefined);
    },
  };
}

const DAILY_API = 'https://api.daily.co/v1';

/**
 * Daily (https://www.daily.co), free tier 10,000 participant-minutes a month.
 * One private room per consultation; each person joins with a short meeting
 * token (the doctor as owner). `roomId` is the room URL, which the app opens.
 * The API key never leaves the server.
 */
export function createDailyVideoProvider(config: { apiKey: string; fetch?: typeof fetch }): VideoProvider {
  const doFetch = config.fetch ?? fetch;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await doFetch(`${DAILY_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json };
  };
  const nameOf = (roomUrl: string) => roomUrl.split('/').pop() ?? roomUrl;
  const inSeconds = (s: number) => Math.floor(Date.now() / 1000) + s;

  return {
    name: 'daily',
    async createRoom(consultationId) {
      const name = `telecare-${consultationId}`;
      const created = await call('POST', '/rooms', {
        name,
        privacy: 'private', // a meeting token is required to enter
        // Rooms delete themselves; a consultation never runs this long.
        properties: { exp: inSeconds(4 * 3600), eject_at_room_exp: true, enable_prejoin_ui: false },
      });
      // Both people joining at once: the second create finds the room already there.
      const room = created.ok ? created.json : (await call('GET', `/rooms/${name}`)).json;
      if (typeof room.url !== 'string') throw new Error(`Daily create room failed: HTTP ${created.status}`);
      return { roomId: room.url };
    },
    async issueJoinToken(roomId, userId, role, ttlSeconds) {
      const res = await call('POST', '/meeting-tokens', {
        properties: {
          room_name: nameOf(roomId),
          user_id: userId,
          is_owner: role === 'DOCTOR',
          user_name: role === 'DOCTOR' ? 'Doctor' : 'Patient',
          exp: inSeconds(ttlSeconds),
        },
      });
      if (typeof res.json.token !== 'string')
        throw new Error(`Daily meeting token failed: HTTP ${res.status}`);
      return { token: res.json.token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
    },
    async endRoom(roomId) {
      // Deleting the room ends the call for everyone and stops rejoining. Best effort.
      await call('DELETE', `/rooms/${nameOf(roomId)}`).catch(() => undefined);
    },
  };
}
