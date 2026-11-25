import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listen, testApp, testDatabaseUrl } from './helpers';

const hasTestDb = Boolean(testDatabaseUrl());

type IntentBody = { intent: { kind: string; specialization?: string } };

describe('POST /v1/voice/intent', () => {
  let server: { url: string; close: () => Promise<void> };

  const post = (body: unknown) =>
    fetch(`${server.url}/v1/voice/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    if (!hasTestDb) return;
    server = await listen(testApp().app);
  });
  afterAll(async () => {
    await server?.close();
  });

  it.skipIf(!hasTestDb)('interprets a specialty phrase', async () => {
    const res = await post({ transcript: 'my child has fever', locale: 'en-IN' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as IntentBody;
    expect(body.intent).toMatchObject({ kind: 'find_doctor', specialization: 'Pediatrics' });
  });

  it.skipIf(!hasTestDb)('lets emergency words win', async () => {
    const body = (await (await post({ transcript: 'he is not breathing' })).json()) as IntentBody;
    expect(body.intent.kind).toBe('emergency');
  });

  it.skipIf(!hasTestDb)('returns unknown for gibberish', async () => {
    const body = (await (await post({ transcript: 'qwerty zzz' })).json()) as IntentBody;
    expect(body.intent.kind).toBe('unknown');
  });

  it.skipIf(!hasTestDb)('rejects an empty transcript with 400', async () => {
    expect((await post({ transcript: '' })).status).toBe(400);
  });

  it.skipIf(!hasTestDb)('rejects unknown fields with 400', async () => {
    expect((await post({ transcript: 'help', patientId: 'secret' })).status).toBe(400);
  });
});
