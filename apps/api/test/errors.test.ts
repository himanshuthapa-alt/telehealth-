import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isApiErrorBody } from '@telecare/shared';
import { errorHandler } from '../src/platform/http/errors';
import { requestContext } from '../src/platform/http/request-context';
import { createLogger } from '../src/platform/logger';
import { listen, testApp } from './helpers';

describe('API error contract', () => {
  let server: Awaited<ReturnType<typeof listen>>;

  beforeAll(async () => {
    server = await listen(testApp().app);
  });
  afterAll(() => server.close());

  it('returns 404 NOT_FOUND with a request id for unknown routes', async () => {
    const res = await fetch(`${server.url}/nope`);
    expect(res.status).toBe(404);
    const body: unknown = await res.json();
    expect(isApiErrorBody(body)).toBe(true);
    expect(body).toMatchObject({ error: { code: 'NOT_FOUND', requestId: res.headers.get('x-request-id') } });
  });

  it('returns 400 INVALID_JSON for malformed bodies', async () => {
    const res = await fetch(`${server.url}/nope`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"broken":',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'INVALID_JSON' } });
  });

  it('hides internal details of unexpected errors', async () => {
    const logger = createLogger('silent');
    const app = express();
    app.use(requestContext(logger));
    app.get('/boom', () => {
      throw new Error('secret internal detail');
    });
    app.use(errorHandler(logger));
    const boom = await listen(app);
    try {
      const res = await fetch(`${boom.url}/boom`);
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toMatchObject({
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
      });
      expect(text).not.toContain('secret internal detail');
    } finally {
      await boom.close();
    }
  });

  it('echoes a valid incoming X-Request-Id', async () => {
    const res = await fetch(`${server.url}/health`, { headers: { 'x-request-id': 'client-req-12345' } });
    expect(res.headers.get('x-request-id')).toBe('client-req-12345');
  });
});
