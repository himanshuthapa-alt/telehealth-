import { createSarvam } from './modules/voice/sarvam';
import { createApp, type SweepConsultations } from './app';
import { createFakeVideoProvider, createHmsVideoProvider } from './modules/consultations/video';
import { loadConfig } from './config/env';
import { createDatabase } from './platform/db/client';
import { createLogger } from './platform/logger';
import { createLogResetCodeDelivery } from './modules/auth/reset-code-delivery';
import pkg from '../package.json' with { type: 'json' };

try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the real environment (e.g. in production)
}

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const database = createDatabase(config.DATABASE_URL, (err) =>
  logger.warn('idle database connection lost', { error: err.message }),
);

try {
  await database.ping();
  logger.info('database connected');
} catch (err) {
  // Start anyway: /health reports "degraded" until the database is reachable.
  logger.warn('database not reachable at startup', { error: (err as Error).message });
}

const app = createApp({
  logger,
  version: pkg.version,
  pingDatabase: database.ping,
  db: database.db,
  jwtSecret: config.JWT_SECRET,
  // ponytail: reset codes go to the API log (D3, no SMS); plug an SMS ResetCodeDelivery in here later
  resetCodeDelivery: createLogResetCodeDelivery(logger),
  video:
    config.VIDEO_PROVIDER === 'hms'
      ? createHmsVideoProvider({
          accessKey: config.HMS_ACCESS_KEY!,
          appSecret: config.HMS_APP_SECRET!,
          templateId: config.HMS_TEMPLATE_ID!,
          roles: { doctor: config.HMS_DOCTOR_ROLE, patient: config.HMS_PATIENT_ROLE },
        })
      : config.VIDEO_PROVIDER === 'fake'
        ? createFakeVideoProvider()
        : null,
  ttsBaseUrl: config.TTS_BASE_URL,
  sarvam: config.SARVAM_API_KEY ? createSarvam({ apiKey: config.SARVAM_API_KEY }) : null,
  doctorProvider: config.DOCTOR_PROVIDER,
  fulfillmentProvider: config.FULFILLMENT_PROVIDER,
  corsOrigins: config.CORS_ORIGINS,
});

// Close consultations whose join window has passed.
// ponytail: an in-process timer, so run one API instance (or move this to a scheduled job)
const sweep = app.locals.sweepConsultations as SweepConsultations;
setInterval(() => {
  sweep().catch((err: Error) => logger.error('consultation sweep failed', { error: err.message }));
}, 60_000).unref();
const server = app.listen(config.PORT, config.HOST, () => {
  logger.info('api listening', { url: `http://localhost:${config.PORT}`, env: config.NODE_ENV });
});

function shutdown(signal: string) {
  logger.info('shutting down', { signal });
  server.close(() => {
    void database.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
