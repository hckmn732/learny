import { z } from 'zod';

import { CivilDate, IsoDateTime, JobAccepted, Uuid } from './common';
import { defineRoute } from './define-route';

// Demonstration routes of SPEC-203 (ENABLE_SDD_PAGES only, never in production): the events/jobs
// pipeline with a simulated failure, and a manual run of the hourly tick.
export const DemoPipelineInput = z.object({ failOnceAt: z.enum(['none', 'step-2']) });
export type DemoPipelineInput = z.infer<typeof DemoPipelineInput>;

export const DemoRunStep = z.object({ name: z.string(), at: IsoDateTime });

export const DemoRunStatus = z.object({
  runId: Uuid,
  steps: z.array(DemoRunStep),
  attempts: z.number().int().min(0),
  finishedAt: IsoDateTime.nullable(),
});
export type DemoRunStatus = z.infer<typeof DemoRunStatus>;

export const HourlyTickInput = z.object({ at: IsoDateTime.optional() });
export type HourlyTickInput = z.infer<typeof HourlyTickInput>;

export const HourlyTickUser = z.object({
  userId: Uuid,
  timezone: z.string(),
  windowStart: IsoDateTime,
  windowEnd: IsoDateTime,
  localDate: CivilDate,
  localWeekday: z.number().int().min(1).max(7),
  /** Local wall-clock time at the start of the window, `HH:MM`. */
  localStart: z.string().regex(/^\d{2}:\d{2}$/),
});
export type HourlyTickUser = z.infer<typeof HourlyTickUser>;

export const HourlyTickOutput = z.object({
  tickAt: IsoDateTime,
  users: z.array(HourlyTickUser),
});
export type HourlyTickOutput = z.infer<typeof HourlyTickOutput>;

export const OutboxCounts = z.object({
  pending: z.number().int().min(0),
  sent: z.number().int().min(0),
  failed: z.number().int().min(0),
});
export type OutboxCounts = z.infer<typeof OutboxCounts>;

export const devEventsDemoStart = defineRoute({
  id: 'dev.events.demo.start',
  method: 'POST',
  path: '/api/v1/dev/sdd/events/demo',
  auth: 'user',
  body: DemoPipelineInput,
  output: JobAccepted,
  successStatus: 202,
  idempotent: true,
  summary: 'Route de démonstration : émet l’événement du pipeline à trois étapes (SPEC-203).',
  errors: ['VALIDATION_FAILED', 'IDEMPOTENCY_IN_PROGRESS'],
});

export const devEventsDemoRun = defineRoute({
  id: 'dev.events.demo.run',
  method: 'GET',
  path: '/api/v1/dev/sdd/events/demo/:runId',
  auth: 'user',
  params: z.object({ runId: Uuid }),
  output: DemoRunStatus,
  successStatus: 200,
  summary: 'Route de démonstration : état d’une exécution du pipeline (SPEC-203).',
  errors: ['VALIDATION_FAILED'],
});

export const devCronHourlyTick = defineRoute({
  id: 'dev.cron.hourlyTick',
  method: 'POST',
  path: '/api/v1/dev/sdd/cron/hourly-tick',
  auth: 'user',
  body: HourlyTickInput,
  output: HourlyTickOutput,
  successStatus: 200,
  summary:
    'Route de démonstration : exécute le tick horaire et liste les utilisateurs de fabrique sélectionnés (SPEC-203).',
  errors: ['VALIDATION_FAILED'],
});

export const devEventsOutbox = defineRoute({
  id: 'dev.events.outbox',
  method: 'GET',
  path: '/api/v1/dev/sdd/events/outbox',
  auth: 'user',
  output: OutboxCounts,
  successStatus: 200,
  summary: 'Route de démonstration : état de la boîte d’envoi de l’utilisateur (SPEC-203).',
  errors: [],
});

export const devJobsRoutes = {
  devEventsDemoStart,
  devEventsDemoRun,
  devEventsOutbox,
  devCronHourlyTick,
} as const;
