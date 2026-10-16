import { AppError } from './errors';

/**
 * Fixed-window counter per key (an IP, or a phone number).
 * ponytail: in-memory, so limits are per API process and reset on restart;
 * move to Postgres/Redis if the API ever runs as more than one instance.
 */
export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    /** Counts one hit for `key`. Throws 429 RATE_LIMITED once `max` is exceeded in the window. */
    hit(key: string, now = Date.now()): void {
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return;
      }
      entry.count += 1;
      if (entry.count > max) {
        const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
        throw new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.', { retryAfterSeconds });
      }
    },
    reset(key: string): void {
      hits.delete(key);
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
