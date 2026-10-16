import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

// OWASP minimum for argon2id: 19 MiB memory, 2 passes, 1 lane.
const PARAMS = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 };

type Params = typeof PARAMS;

function derive(password: string, nonce: Buffer, params: Params): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    argon2('argon2id', { message: password, nonce, ...params }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Hashes with argon2id (Node's built-in implementation), stored in the standard PHC string format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, PARAMS);
  const { memory: m, passes: t, parallelism: p } = PARAMS;
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

/** Constant-time check. Reads the parameters from the stored hash, so they can be raised later. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([\w-]+)\$([\w-]+)$/.exec(stored);
  if (!match) return false;
  const [, m, t, p, salt, hash] = match;
  const expected = Buffer.from(hash!, 'base64url');
  const actual = await derive(password, Buffer.from(salt!, 'base64url'), {
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
    tagLength: expected.length,
  });
  return timingSafeEqual(actual, expected);
}

/**
 * Checked when a phone number has no account, so "unknown phone" takes as long
 * as "wrong password" and response timing doesn't reveal which accounts exist.
 */
export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
