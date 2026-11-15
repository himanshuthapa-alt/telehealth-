import express from 'express';
import type { Database } from './platform/db/client';
import type { Logger } from './platform/logger';
import { createAccessTokens, createAuthGuards } from './platform/http/auth';
import { errorHandler, notFoundHandler } from './platform/http/errors';
import { requestContext } from './platform/http/request-context';
import { healthRoutes } from './modules/health/health.routes';
import { createAuditLog } from './modules/audit/audit';
import { createRefreshTokenRepository, createResetCodeRepository } from './modules/auth/auth.repository';
import { authRoutes } from './modules/auth/auth.routes';
import { createAuthService, type AuthRepos } from './modules/auth/auth.service';
import type { ResetCodeDelivery } from './modules/auth/reset-code-delivery';
import { createUsersRepository } from './modules/users/users.repository';
import { createPatientProfileRepository } from './modules/users/patient-profile.repository';
import { usersRoutes } from './modules/users/users.routes';
import { createDoctorDirectory } from './modules/discovery/discovery.repository';
import { discoveryRoutes } from './modules/discovery/discovery.routes';
import { createScheduleRepository } from './modules/scheduling/scheduling.repository';
import { schedulingRoutes } from './modules/scheduling/scheduling.routes';
import { createSlotService } from './modules/scheduling/slot-service';
import { createAppointmentRepository } from './modules/appointments/appointments.repository';
import { appointmentRoutes } from './modules/appointments/appointments.routes';
import { createAppointmentService } from './modules/appointments/appointments.service';
import { createConsultationRepository } from './modules/consultations/consultations.repository';
import { consultationRoutes } from './modules/consultations/consultations.routes';
import {
  createConsultationService,
  type ConsultationService,
} from './modules/consultations/consultations.service';
import { createNotifier } from './modules/consultations/notifier';
import type { VideoProvider } from './modules/consultations/video';
import { createMedicineCatalog } from './modules/pharmacy/medicines.repository';
import { medicineRoutes } from './modules/pharmacy/medicines.routes';
import { createPrescriptionRepository } from './modules/prescriptions/prescriptions.repository';
import { prescriptionRoutes } from './modules/prescriptions/prescriptions.routes';
import { createPrescriptionService } from './modules/prescriptions/prescriptions.service';
import { createVoiceRepository } from './modules/voice/voice.repository';
import { createVoiceService } from './modules/voice/voice.service';
import { voiceRoutes } from './modules/voice/voice.routes';
import type { VoiceProviders } from './modules/voice/providers';
import { createTriageService } from './modules/triage/triage.service';
import { createMatchingRepository } from './modules/matching/matching.repository';
import { createMatchingService } from './modules/matching/matching.service';
import { createDispatchRepository } from './modules/dispatch/dispatch.repository';
import { createDispatchService } from './modules/dispatch/dispatch.service';
import { dispatchRoutes } from './modules/dispatch/dispatch.routes';
import { addDays, istInstant } from '@telecare/shared';

export interface AppDeps {
  logger: Logger;
  version: string;
  pingDatabase: () => Promise<void>;
  db: Database;
  jwtSecret: string;
  resetCodeDelivery: ResetCodeDelivery;
  /** The clock for booking rules. Tests pass a fixed one. */
  now?: () => Date;
  /** null = consultations run in chat only. */
  video: VideoProvider | null;
  /** Voice-first adapters (STT/TTS/LLM/telephony), each with a fake mode. */
  voice: VoiceProviders;
  /** Hours to keep raw symptom audio server-side (0 = never). */
  voiceRetentionHours: number;
  triagePromptVersion: string;
}

/**
 * Composes the HTTP application. Dependencies are passed in (not imported),
 * so tests can build the app with fakes and modules stay decoupled.
 */
/** The Express app; `app.locals.sweepConsultations` is the consultation closer (see server.ts). */
export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestContext(deps.logger));
  app.use(express.json({ limit: '100kb' }));

  const repos = (db: Parameters<typeof createAuditLog>[0]): AuthRepos => ({
    users: createUsersRepository(db),
    refreshTokens: createRefreshTokenRepository(db),
    resetCodes: createResetCodeRepository(db),
    audit: createAuditLog(db),
  });
  const accessTokens = createAccessTokens(deps.jwtSecret);
  const guards = createAuthGuards(accessTokens, createAuditLog(deps.db));
  const authService = createAuthService({
    repos: repos(deps.db),
    inTransaction: (work) => deps.db.transaction((tx) => work(repos(tx))),
    accessTokens,
    resetCodeDelivery: deps.resetCodeDelivery,
  });

  app.use(healthRoutes({ version: deps.version, pingDatabase: deps.pingDatabase }));
  app.use(authRoutes(authService, guards));
  app.use(usersRoutes(createPatientProfileRepository(deps.db), guards));
  const now = deps.now ?? (() => new Date());
  const directory = createDoctorDirectory(deps.db, now);
  const schedule = createScheduleRepository(deps.db);
  const appointmentRepo = createAppointmentRepository(deps.db, now);
  const slots = createSlotService({ schedule, busy: appointmentRepo.busy, now });

  app.use(discoveryRoutes(directory, guards));
  app.use(
    schedulingRoutes(
      {
        schedule,
        slots,
        doctorExists: async (id) => (await directory.get(id)) !== null,
        bookedOnDate: (doctorId, date) =>
          appointmentRepo.countBooked(doctorId, istInstant(date, 0), istInstant(addDays(date, 1), 0)),
      },
      guards,
    ),
  );
  const consultationService = createConsultationService({
    repo: createConsultationRepository(deps.db),
    appointments: appointmentRepo,
    video: deps.video,
    notifier: createNotifier(),
    audit: createAuditLog(deps.db),
    now,
  });
  app.use(consultationRoutes(consultationService, guards));
  const catalog = createMedicineCatalog(deps.db);
  app.use(medicineRoutes(catalog, guards));
  app.use(
    prescriptionRoutes(
      createPrescriptionService({
        repo: createPrescriptionRepository(deps.db, now),
        consultations: consultationService,
        catalog,
        audit: createAuditLog(deps.db),
        now,
      }),
      guards,
    ),
  );
  // The server runs this every minute to close consultations whose window has passed.
  app.locals.sweepConsultations = consultationService.sweep;

  // --- Voice-first triage (project map §5–§8): speak -> STT -> language -> triage
  //     (red-flags first) -> matching -> routine booking or urgent paging. ---
  const triageService = createTriageService({
    llm: deps.voice.llm,
    fallback: deps.voice.fallback,
    promptVersion: deps.triagePromptVersion,
    logger: deps.logger,
  });
  const voiceService = createVoiceService({
    stt: deps.voice.stt,
    tts: deps.voice.tts,
    triage: triageService,
    repo: createVoiceRepository(deps.db),
    retentionHours: deps.voiceRetentionHours,
    promptVersion: deps.triagePromptVersion,
    now,
    logger: deps.logger,
  });
  const matchingService = createMatchingService({
    directory,
    repo: createMatchingRepository(deps.db),
  });
  const dispatchRepo = createDispatchRepository(deps.db);
  const dispatchService = createDispatchService({
    repo: dispatchRepo,
    telephony: deps.voice.telephony,
    logger: deps.logger,
  });
  app.use(voiceRoutes({ voice: voiceService, matching: matchingService, dispatch: dispatchService }, guards));
  app.use(dispatchRoutes(dispatchService, dispatchRepo, guards));
  app.use(
    appointmentRoutes(
      createAppointmentService({ repo: appointmentRepo, slots, audit: createAuditLog(deps.db), now }),
      guards,
    ),
  );

  app.use(notFoundHandler);
  app.use(errorHandler(deps.logger));
  return app;
}

export type SweepConsultations = ConsultationService['sweep'];
