import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listen, testApp, testDatabaseUrl } from './helpers';

const hasTestDb = Boolean(testDatabaseUrl());

describe('GET /v1/speech (Chatterbox TTS proxy)', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeAll(async () => {
    if (!hasTestDb) return;
    // Point at a port nothing listens on so the proxy fetch fails fast.
    const { app } = testApp({ ttsBaseUrl: 'http://127.0.0.1:9' });
    server = await listen(app);
  });

  afterAll(async () => {
    await server?.close();
  });

  it.skipIf(!hasTestDb)('rejects an empty text with 400', async () => {
    const res = await fetch(`${server.url}/v1/speech?text=`);
    expect(res.status).toBe(400);
  });

  it.skipIf(!hasTestDb)('returns 503 when the TTS service is unreachable', async () => {
    const res = await fetch(`${server.url}/v1/speech?text=Hello`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('TTS_UNAVAILABLE');
  });
});
