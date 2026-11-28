import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthSession } from '@telecare/shared';
import { createSarvam, type Sarvam } from '../src/modules/voice/sarvam';
import { listen, randomPhone, testApp } from './helpers';

/** Indian-language voice: the Sarvam client (fake fetch) and the routes (fake client). */

describe('Sarvam client', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const reply = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
  const fakeFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/speech-to-text'))
      return reply({ transcript: 'my child has fever', language_code: 'ta-IN' });
    if (url.endsWith('/translate')) return reply({ translated_text: 'डॉक्टर खोज रहे हैं' });
    return reply({ audios: [Buffer.from('RIFFwav').toString('base64')] });
  }) as typeof fetch;
  const sarvam = createSarvam({ apiKey: 'k', fetch: fakeFetch });

  it('sends audio in translate mode with auto language detection, and returns English', async () => {
    const out = await sarvam.understand(Buffer.alloc(2000), 'audio/mp4');
    expect(out).toEqual({ english: 'my child has fever', languageCode: 'ta-IN' });
    const form = calls[0]!.init.body as FormData;
    expect(form.get('mode')).toBe('translate');
    expect(form.get('language_code')).toBe('unknown');
    expect((calls[0]!.init.headers as Record<string, string>)['api-subscription-key']).toBe('k');
  });

  it('translates the reply before speaking it in Hindi; English skips translation', async () => {
    calls.length = 0;
    const wav = await sarvam.speak('Finding doctors', 'hi-IN');
    expect(wav.toString()).toBe('RIFFwav');
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['translate', 'text-to-speech']);
    expect(JSON.parse(calls[1]!.init.body as string)).toMatchObject({
      text: 'डॉक्टर खोज रहे हैं',
      language_code: 'hi-IN',
    });
    calls.length = 0;
    await sarvam.speak('Finding doctors', 'en-IN');
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['text-to-speech']);
  });

  it('surfaces upstream failures (e.g. out of credits)', async () => {
    const broke = createSarvam({ apiKey: 'k', fetch: (() => reply({}, 402)) as typeof fetch });
    await expect(broke.understand(Buffer.alloc(2000), 'audio/mp4')).rejects.toThrow('402');
  });
});

describe('voice routes with Sarvam', () => {
  let server: Awaited<ReturnType<typeof listen>>;
  let token: string;
  const fake: Sarvam = {
    understand: async () => ({ english: 'please help, he is not breathing', languageCode: 'hi-IN' }),
    speak: async () => Buffer.from('RIFF'),
  };

  beforeAll(async () => {
    server = await listen(testApp({ sarvam: fake }).app);
    const phone = randomPhone();
    const res = await fetch(`${server.url}/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, password: 'green-mango-42', fullName: 'Voice Tester', consent: true }),
    });
    token = ((await res.json()) as AuthSession).accessToken;
  });
  afterAll(() => server.close());

  const understand = (auth?: string, bytes = 4000) =>
    fetch(`${server.url}/v1/voice/understand`, {
      method: 'POST',
      headers: { 'content-type': 'audio/mp4', ...(auth && { authorization: `Bearer ${auth}` }) },
      body: new Uint8Array(bytes),
    });

  it('turns speech in any language into an intent; emergency still wins', async () => {
    const res = await understand(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ languageCode: 'hi-IN', intent: { kind: 'emergency' } });
  });

  it('needs sign-in and real audio', async () => {
    expect((await understand()).status).toBe(401);
    expect((await understand(token, 10)).status).toBe(400);
  });

  it('advertises the capability and speaks in the asked language', async () => {
    expect(await (await fetch(`${server.url}/v1/voice/capabilities`)).json()).toEqual({
      indianLanguages: true,
    });
    const res = await fetch(`${server.url}/v1/speech?text=Hello&lang=ta-IN`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('audio/wav');
    expect((await fetch(`${server.url}/v1/speech?text=Hello&lang=xx`)).status).toBe(400);
  });

  it('without a key, says the feature is off', async () => {
    const plain = await listen(testApp().app);
    expect(await (await fetch(`${plain.url}/v1/voice/capabilities`)).json()).toEqual({
      indianLanguages: false,
    });
    await plain.close();
  });
});
