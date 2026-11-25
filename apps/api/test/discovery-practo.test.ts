import { describe, expect, it } from 'vitest';
import { createPractoDirectory } from '../src/modules/discovery/discovery.practo';

describe('Practo doctor directory (stub)', () => {
  const practo = createPractoDirectory();

  it('fails clearly until credentials exist (never silently empty)', async () => {
    await expect(practo.search({})).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    await expect(practo.get('any-id')).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });
});
