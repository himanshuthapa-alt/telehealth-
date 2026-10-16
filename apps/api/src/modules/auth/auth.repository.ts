import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../platform/db/client';
import { passwordResetCodes, refreshTokens } from './auth.schema';

export interface RefreshTokenRepository {
  create(token: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  /**
   * Atomically marks an active, unexpired token as rotated (and revoked) and
   * returns its user. Returns null if the token is unknown, revoked or expired,
   * so the same token can never be rotated twice, even by concurrent requests.
   */
  rotate(tokenHash: string): Promise<{ userId: string } | null>;
  /** Revokes an active token (logout). Returns its user, or null if it wasn't active. */
  revoke(tokenHash: string): Promise<{ userId: string } | null>;
  /** The owner of a token that was already rotated: presenting it again is a theft signal. */
  findRotatedOwner(tokenHash: string): Promise<string | null>;
  revokeAllForUser(userId: string): Promise<void>;
}

export interface ResetCodeRepository {
  /** Invalidates earlier codes for the user, then stores the new one. */
  replace(code: { userId: string; codeHash: string; expiresAt: Date }): Promise<void>;
  /** The newest code that is unused, unexpired and under the attempt limit. */
  findActive(userId: string, maxAttempts: number): Promise<{ id: string; codeHash: string } | null>;
  recordFailedAttempt(id: string): Promise<void>;
  /** False if another request used the code first. */
  markUsed(id: string): Promise<boolean>;
}

export function createRefreshTokenRepository(db: DbExecutor): RefreshTokenRepository {
  async function revokeActive(tokenHash: string, rotated: boolean) {
    const now = new Date();
    const [row] = await db
      .update(refreshTokens)
      .set({ revokedAt: now, rotatedAt: rotated ? now : null })
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, sql`now()`),
        ),
      )
      .returning({ userId: refreshTokens.userId });
    return row ?? null;
  }

  return {
    async create(token) {
      await db.insert(refreshTokens).values(token);
    },
    rotate: (tokenHash) => revokeActive(tokenHash, true),
    revoke: (tokenHash) => revokeActive(tokenHash, false),
    async findRotatedOwner(tokenHash) {
      const [row] = await db
        .select({ userId: refreshTokens.userId, rotatedAt: refreshTokens.rotatedAt })
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash));
      return row?.rotatedAt ? row.userId : null;
    },
    async revokeAllForUser(userId) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    },
  };
}

export function createResetCodeRepository(db: DbExecutor): ResetCodeRepository {
  return {
    async replace(code) {
      await db
        .update(passwordResetCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetCodes.userId, code.userId), isNull(passwordResetCodes.usedAt)));
      await db.insert(passwordResetCodes).values(code);
    },
    async findActive(userId, maxAttempts) {
      const [row] = await db
        .select({ id: passwordResetCodes.id, codeHash: passwordResetCodes.codeHash })
        .from(passwordResetCodes)
        .where(
          and(
            eq(passwordResetCodes.userId, userId),
            isNull(passwordResetCodes.usedAt),
            gt(passwordResetCodes.expiresAt, sql`now()`),
            lt(passwordResetCodes.attempts, maxAttempts),
          ),
        )
        .orderBy(desc(passwordResetCodes.createdAt))
        .limit(1);
      return row ?? null;
    },
    async recordFailedAttempt(id) {
      await db
        .update(passwordResetCodes)
        .set({ attempts: sql`${passwordResetCodes.attempts} + 1` })
        .where(eq(passwordResetCodes.id, id));
    },
    async markUsed(id) {
      const rows = await db
        .update(passwordResetCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetCodes.id, id), isNull(passwordResetCodes.usedAt)))
        .returning({ id: passwordResetCodes.id });
      return rows.length === 1;
    },
  };
}
