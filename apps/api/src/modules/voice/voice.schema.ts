import { sql } from 'drizzle-orm';
import { integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { SPEECH_LANGUAGES, VOICE_CHANNELS, VOICE_OUTCOMES } from '@telecare/shared';
import { users } from '../users/users.schema';

export const voiceChannel = pgEnum('voice_channel', VOICE_CHANNELS);
export const voiceOutcome = pgEnum('voice_outcome', VOICE_OUTCOMES);
export const speechLanguage = pgEnum('speech_language', SPEECH_LANGUAGES);

/** One voice conversation (project map §9). Patient is null for IVR callers until identified. */
export const voiceSessions = pgTable('voice_sessions', {
  id: uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  patientId: uuid().references(() => users.id, { onDelete: 'set null' }),
  channel: voiceChannel().notNull().default('APP'),
  /** Hash, never the raw number: IVR callers before login (DPDP minimisation). */
  callerPhoneHash: text(),
  languagePrior: speechLanguage(),
  outcome: voiceOutcome(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp({ withTimezone: true }),
});

/**
 * One request/response in a session. Transcript is health data; raw audio is NOT
 * stored by default (audioRef null unless VOICE_AUDIO_RETENTION_HOURS > 0).
 */
export const voiceTurns = pgTable(
  'voice_turns',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sessionId: uuid()
      .notNull()
      .references(() => voiceSessions.id, { onDelete: 'cascade' }),
    /** Idempotency key within a session (offline retries reuse it). */
    clientTurnId: text().notNull(),
    direction: text().notNull().default('IN'),
    transcript: text().notNull().default(''),
    sttProvider: text(),
    sttLanguage: text(),
    detectedLanguage: speechLanguage(),
    languageConfidence: numeric({ precision: 3, scale: 2, mode: 'number' }),
    ttsProvider: text(),
    /** Per-stage latency, e.g. { stt: 820, triage: 1400, tts: 600 }. */
    latencyMs: jsonb(),
    audioRef: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('voice_turns_session_client_turn').on(t.sessionId, t.clientTurnId)],
);

/** Versioned prompt clips that drive the offline voice menu (project map §9, §6.6). */
export const voicePrompts = pgTable(
  'voice_prompts',
  {
    id: uuid()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    key: text().notNull(),
    language: speechLanguage().notNull(),
    version: integer().notNull().default(1),
    fileUrl: text().notNull(),
    durationMs: integer(),
    /** Consent reference for the recorded volunteer's voice (DPDP). */
    recordedBy: text(),
    checksum: text(),
  },
  (t) => [unique('voice_prompts_key_lang_version').on(t.key, t.language, t.version)],
);
