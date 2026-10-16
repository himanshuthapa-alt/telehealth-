import { randomBytes, randomUUID } from 'node:crypto';
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
