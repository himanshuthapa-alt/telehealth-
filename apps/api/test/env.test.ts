import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env';

const REQUIRED = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', JWT_SECRET: 'x'.repeat(32) };

describe('loadConfig', () => {
  it('applies defaults when only the required values are given', () => {
    const config = loadConfig(REQUIRED);
    expect(config).toMatchObject({ NODE_ENV: 'development', PORT: 4000, LOG_LEVEL: 'info' });
  });

  it('refuses to start without a database URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres database URL and an invalid port', () => {
    expect(() => loadConfig({ ...REQUIRED, DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...REQUIRED, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('refuses a missing or short JWT secret', () => {
    expect(() => loadConfig({ DATABASE_URL: REQUIRED.DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...REQUIRED, JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });
});
