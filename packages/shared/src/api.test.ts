import { describe, expect, it } from 'vitest';
import { isApiErrorBody } from './api';

describe('isApiErrorBody', () => {
  it('accepts a well-formed API error', () => {
    expect(isApiErrorBody({ error: { code: 'NOT_FOUND', message: 'x' } })).toBe(true);
  });

  it('rejects unknown codes and malformed bodies', () => {
    expect(isApiErrorBody({ error: { code: 'MADE_UP', message: 'x' } })).toBe(false);
    expect(isApiErrorBody({ error: 'NOT_FOUND' })).toBe(false);
    expect(isApiErrorBody({ status: 'ok' })).toBe(false);
    expect(isApiErrorBody(null)).toBe(false);
    expect(isApiErrorBody('error')).toBe(false);
  });
});
