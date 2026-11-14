import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contract of the agenda screen (SPEC-704 ET-1, BR-AGE-01, BR-AGE-04, BR-AGE-06; ADR-0183).
// One read-only call returns the slots of a civil window (≤ 42 days) in the learner's own time
// zone, the navigation bounds of the formations on display and the period totals. The browser only
// formats and lays out; every status, href and label is computed server-side behind RLS.

/** The twelve kinds of schedule slots shown on the agenda (ET-3). */
export const AGENDA_SLOT_KINDS = [
  'contributions',
  'course',
  'exercise',
  'validation_quiz',
  'mock_exam',
  'global_quiz',
  'revision',
  'sprint',
  'warmup',
  'micro_session',
  'buffer',
  'weekly_review',
] as const;
export const AgendaSlotKind = z.enum(AGENDA_SLOT_KINDS);
export type AgendaSlotKind = z.infer<typeof AgendaSlotKind>;

/** Statuses shown on the agenda; `moved` and `cancelled` never reach the client (BR-AGE-04). */
export const AGENDA_SLOT_STATUSES = ['planned', 'done', 'missed'] as const;

/** EF-1 — the filter accepts « all » or one of the learner's formation identifiers. */
export const AgendaFormationFilter = z.union([z.literal('all'), Uuid]);

/** ET-1 — the window is civil, ordered and at most 42 days wide. */
export const AGENDA_MAX_RANGE_DAYS = 42;

export const AgendaQuery = z
  .object({
    from: CivilDate,
    to: CivilDate,
    formation: AgendaFormationFilter,
  })
  .refine((query) => query.from <= query.to, {
    message: 'La date de début doit précéder la date de fin.',
  })
  .refine((query) => civilDayDistance(query.from, query.to) <= AGENDA_MAX_RANGE_DAYS, {
    message: `La période affichée ne peut pas dépasser ${String(AGENDA_MAX_RANGE_DAYS)} jours.`,
  });
export type AgendaQuery = z.infer<typeof AgendaQuery>;

/** Number of civil days between two `YYYY-MM-DD` values (`to - from`, 0 when equal). */
function civilDayDistance(from: string, to: string): number {
  const [fromYear = 0, fromMonth = 1, fromDay = 1] = from.split('-').map(Number);
  const [toYear = 0, toMonth = 1, toDay = 1] = to.split('-').map(Number);
  const fromMs = Date.UTC(fromYear, fromMonth - 1, fromDay);
  const toMs = Date.UTC(toYear, toMonth - 1, toDay);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/** Formations shown in the filter selector (BR-AGE-01): active, paused or completed. */
export const AgendaFormationStatus = z.enum(['active', 'paused', 'completed']);
export type AgendaFormationStatus = z.infer<typeof AgendaFormationStatus>;

export const AgendaFormation = z.object({
  id: Uuid,
  title: z.string().min(1),
  /** Monogram shown in the month chips of another formation (`{sigle} · {HH:MM}`). */
  sigle: z.string().min(1).max(8),
  status: AgendaFormationStatus,
});
export type AgendaFormation = z.infer<typeof AgendaFormation>;

export const AgendaSlotStatus = z.enum(AGENDA_SLOT_STATUSES);
export type AgendaSlotStatus = z.infer<typeof AgendaSlotStatus>;

export const AgendaSlot = z.object({
  id: Uuid,
  formationId: Uuid,
  moduleId: Uuid.nullable(),
  /** Position of the module in the formation, when the slot carries one (EF-7). */
  moduleNumber: z.number().int().min(1).nullable(),
  kind: AgendaSlotKind,
  /** Label of the kind, from the agenda configuration (ET-3). */
  typeLabel: z.string().min(1),
  title: z.string().min(1),
  meta: z.string().max(1000).nullable(),
  /** Civil day of the slot start in the learner's zone (CL-1, CL-3). */
  date: CivilDate,
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  /** Local minutes since 00:00 of the slot start (EF-6). */
  startMinutes: z.number().int().min(0).max(1439),
  /** Local minutes since 00:00 of the slot start; after midnight → 0..30 for a 23:30–00:30 slot. */
  endMinutes: z.number().int().min(0).max(1439),
  status: AgendaSlotStatus,
  /** Target of the « Ouvrir » action (ET-5). */
  href: z.string().min(1),
  activityId: Uuid.nullable(),
  /** `planned` and not started yet; drives the « Déplacer » button of SPEC-705 (ET-2). */
  movable: z.boolean(),
});
export type AgendaSlot = z.infer<typeof AgendaSlot>;

export const AgendaPeriod = z.object({ start: CivilDate, end: CivilDate });
export type AgendaPeriod = z.infer<typeof AgendaPeriod>;

/** Totals of the displayed period (BR-AGE-06, EF-11). */
export const AgendaTotals = z.object({
  plannedMinutes: z.number().int().min(0),
  doneMinutes: z.number().int().min(0),
  marginsRemaining: z.number().int().min(0),
});
export type AgendaTotals = z.infer<typeof AgendaTotals>;

export const AgendaDto = z.object({
  timezone: z.string().min(1),
  today: CivilDate,
  /** Navigation bounds: union of the visible formations' periods (ADR-0183). */
  bounds: AgendaPeriod.nullable(),
  /** Period written under the mini-calendar: filtered formation, or current one (ADR-0183). */
  captionPeriod: AgendaPeriod.nullable(),
  /** Study days of the learner, 1 = Monday … 7 = Sunday (CL-7). */
  studyDays: z.array(z.number().int().min(1).max(7)),
  formations: z.array(AgendaFormation),
  slots: z.array(AgendaSlot),
  totals: AgendaTotals,
});
export type AgendaDto = z.infer<typeof AgendaDto>;

export const agendaGet = defineRoute({
  id: 'agenda.get',
  method: 'GET',
  path: '/api/v1/agenda',
  auth: 'user',
  query: AgendaQuery,
  output: AgendaDto,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Agenda de l’apprenant : créneaux d’une période civile (42 jours au plus) dans son fuseau, bornes de navigation, période de la légende et totaux (SPEC-704).',
  errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND'],
});

export const agendaRoutes = { agendaGet } as const;
