import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { createApp, type AppDeps } from '../src/app';
import { createDatabase, type DatabaseHandle } from '../src/platform/db/client';
import { createLogger } from '../src/platform/logger';
import { createFakeVideoProvider } from '../src/modules/consultations/video';
import { createFakeStt } from '../src/modules/voice/stt';
import { createNoAudioTts } from '../src/modules/voice/tts';
import { createFakeTriageLlm } from '../src/modules/triage/triage-llm';

/** Starts an app on a random port for a test and returns its base URL + a close function. */
export async function listen(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see apps/api/.env.example)');
  return url;
}

export const TEST_JWT_SECRET = 'test-secret-test-secret-test-secret-123';

let shared: DatabaseHandle | undefined;
/** One pool per test file, connected lazily to the test database. */
export function testDatabase(): DatabaseHandle {
  shared ??= createDatabase(testDatabaseUrl());
  return shared;
}

/** Builds the full app against the test database. Reset codes are captured in `sentCodes`. */
export function testApp(overrides: Partial<AppDeps> = {}) {
  const sentCodes = new Map<string, string>();
  const database = testDatabase();
  const app = createApp({
    logger: createLogger('silent'),
    version: 'test',
    pingDatabase: database.ping,
    db: database.db,
    jwtSecret: TEST_JWT_SECRET,
    resetCodeDelivery: { send: async (phone, code) => void sentCodes.set(phone, code) },
    video: createFakeVideoProvider(),
    voice: {
      stt: createFakeStt(),
      tts: createNoAudioTts('fake'),
      llm: createFakeTriageLlm(),
      fallback: createFakeTriageLlm(),
      telephony: null,
    },
    voiceRetentionHours: 0,
    triagePromptVersion: 'test',
    ...overrides,
  });
  return { app, sentCodes };
}

/** A random valid Indian mobile number, so parallel test files never collide. */
export function randomPhone(): string {
  return `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
}
