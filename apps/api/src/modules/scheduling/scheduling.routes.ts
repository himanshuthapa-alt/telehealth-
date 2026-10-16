import { Router } from 'express';
import { z } from 'zod';
import {
  BOOKING_HORIZON_DAYS,
  SLOT_MINUTES_OPTIONS,
  addDays,
  toMinutes,
  type SlotsResponse,
} from '@telecare/shared';
import { getActor, type AuthGuards } from '../../platform/http/auth';
import { AppError } from '../../platform/http/errors';
import { parseBody, parseQuery } from '../../platform/http/validate';
import type { ScheduleRepository } from './scheduling.repository';
import type { SlotService } from './slot-service';
import { rulesOverlap } from './slots';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Use HH:MM (24-hour)');
const isoDate = z.iso.date('Use YYYY-MM-DD');

const Rule = z
  .strictObject({
    weekday: z.number().int().min(1).max(7),
    startTime: hhmm,
    endTime: hhmm,
    slotMinutes: z.union(SLOT_MINUTES_OPTIONS.map((m) => z.literal(m))),
  })
  .refine(
    (r) => toMinutes(r.endTime) - toMinutes(r.startTime) >= r.slotMinutes,
    'The block must fit at least one slot',
  );

const RulesBody = z.strictObject({
  rules: z
    .array(Rule)
    .max(21)
    .refine(
      (rules) => !rules.some((a, i) => rules.slice(i + 1).some((b) => rulesOverlap(a, b))),
      'Blocks on the same day must not overlap',
    ),
});

const BlockBody = z.strictObject({ reason: z.string().trim().max(100).optional() });

const SlotsQuery = z.strictObject({
  from: isoDate.optional(),
  days: z.coerce.number().int().min(1).max(BOOKING_HORIZON_DAYS).optional(),
});

export interface SchedulingRouteDeps {
  schedule: ScheduleRepository;
  slots: SlotService;
  /** True if an active doctor with this id exists. */
  doctorExists: (id: string) => Promise<boolean>;
  /** BOOKED appointments a doctor has on an IST date (so the app can warn when blocking it). */
  bookedOnDate: (doctorId: string, date: string) => Promise<number>;
}

export function schedulingRoutes(deps: SchedulingRouteDeps, guards: AuthGuards): Router {
  const router = Router();
  const doctorOnly = [guards.requireAuth, guards.requireRole('DOCTOR')];
  const notFound = () => new AppError(404, 'NOT_FOUND', 'Doctor not found');

  /** Free slots. Patients: any doctor. Doctors: only their own (blueprint §12). */
  router.get(
    '/v1/doctors/:id/slots',
    guards.requireAuth,
    guards.requireRole('PATIENT', 'DOCTOR'),
    async (req, res) => {
      const actor = getActor(res);
      const doctorId = String(req.params.id);
      if (!z.uuid().safeParse(doctorId).success) throw notFound();
      if (actor.role === 'DOCTOR' && actor.id !== doctorId) throw notFound();
      if (!(await deps.doctorExists(doctorId))) throw notFound();

      const query = parseQuery(SlotsQuery, req);
      const from = query.from ?? deps.slots.today();
      const days = query.days ?? 7;
      const last = deps.slots.lastBookableDate();
      if (from < deps.slots.today() || from > last)
        throw new AppError(400, 'VALIDATION_FAILED', 'Date out of range', {
          fields: { from: 'Pick a date in the next 14 days' },
        });
      // Never return days past the booking horizon.
      const span = Math.min(
        days,
        BOOKING_HORIZON_DAYS - Math.round((Date.parse(from) - Date.parse(deps.slots.today())) / 86_400_000),
      );
      const body: SlotsResponse = { doctorId, days: await deps.slots.freeDays(doctorId, from, span) };
      res.json(body);
    },
  );

  router.get('/v1/availability', ...doctorOnly, async (_req, res) => {
    res.json(await deps.schedule.getAvailability(getActor(res).id, deps.slots.today()));
  });

  /** Replaces the whole weekly template. Existing bookings are kept. */
  router.put('/v1/availability/rules', ...doctorOnly, async (req, res) => {
    const { rules } = parseBody(RulesBody, req);
    const doctorId = getActor(res).id;
    await deps.schedule.replaceRules(doctorId, rules);
    res.json(await deps.schedule.getAvailability(doctorId, deps.slots.today()));
  });

  /** Blocks a date (idempotent). Tells the doctor how many bookings that day already has. */
  router.put('/v1/availability/exceptions/:date', ...doctorOnly, async (req, res) => {
    const date = isoDate.safeParse(req.params.date);
    if (!date.success || date.data < deps.slots.today() || date.data > addDays(deps.slots.today(), 365))
      throw new AppError(400, 'VALIDATION_FAILED', 'Invalid date', {
        fields: { date: 'Pick a date from today on' },
      });
    const { reason } = parseBody(BlockBody, req);
    const doctorId = getActor(res).id;
    await deps.schedule.blockDate(doctorId, date.data, reason || null);
    res.json({
      date: date.data,
      reason: reason || null,
      bookedThatDay: await deps.bookedOnDate(doctorId, date.data),
    });
  });

  router.delete('/v1/availability/exceptions/:date', ...doctorOnly, async (req, res) => {
    const removed = await deps.schedule.unblockDate(getActor(res).id, String(req.params.date));
    if (!removed) throw new AppError(404, 'NOT_FOUND', 'That date is not blocked');
    res.status(204).end();
  });

  return router;
}
