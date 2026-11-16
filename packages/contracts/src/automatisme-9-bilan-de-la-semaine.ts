import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { AutomationActionStatus } from './moteur-d-automatismes';
import { BilanParams } from './parametres-automatismes';

// « Bilan de la semaine » (SPEC-720, BR-AUT-09, ADR-0190, ADR-0047).
//
// The canonical settings are the `bilan` object of SPEC-710. This module fixes the vocabulary of the
// weekly review: the single action kind, its computed payload (hours, retention, at-risk notions and
// the plan of the next local week), and the read view of the home card. Every figure is computed by
// the service from the learner's own rows; a missing measure stays `null` so the interface can say
// « Non disponible » instead of inventing a zero (ET-4, CL-4).

/** SPEC-710 / SPEC-720 — the canonical settings: Friday/Saturday/Sunday, 18/19/20 h, app or e-mail. */
export const WeeklyReviewParams = BilanParams;
export type WeeklyReviewParams = z.infer<typeof WeeklyReviewParams>;

/** ET-3 — the single kind written to the automation journal by this capacity. */
export const WEEKLY_REVIEW_KIND = 'weekly_review' as const;

/** ET-3 — the automation key of the definition (ADR-0190). */
export const WEEKLY_REVIEW_AUTOMATION = 'bilan' as const;

/** EF-2 — « Mes disponibilités changent » opens the rhythm section of the settings screen. */
export const WEEKLY_REVIEW_AVAILABILITY_HREF = '/parametres#rythme';

export const WEEKLY_REVIEW_CHANNELS = ['app', 'app_email'] as const;
export const WeeklyReviewChannel = z.enum(WEEKLY_REVIEW_CHANNELS);
export type WeeklyReviewChannel = z.infer<typeof WeeklyReviewChannel>;

/** EF-2, ET-4 — the displayed retention at one month, with its real numerator and denominator. */
export const WeeklyReviewRetention = z
  .object({
    horizonDays: z.number().int().positive(),
    /** Percentage in double precision, or null when nothing was measured (CL-4). */
    rate: z.number().min(0).max(100).nullable(),
    reviewed: z.number().int().min(0),
    successful: z.number().int().min(0),
  })
  .strict();
export type WeeklyReviewRetention = z.infer<typeof WeeklyReviewRetention>;

/** ET-4 — one notion due or carrying an open gap, ordered by mastery then label. */
export const WeeklyReviewAtRiskNotion = z
  .object({
    notionId: Uuid,
    label: z.string().min(1).max(120),
    mastery: z.number().min(0).max(100),
  })
  .strict();
export type WeeklyReviewAtRiskNotion = z.infer<typeof WeeklyReviewAtRiskNotion>;

/** ET-4 — one local day of the next week carrying planned slots. */
export const WeeklyReviewPlanDay = z
  .object({
    date: CivilDate,
    minutes: z.number().int().min(0),
    slots: z.number().int().min(0),
  })
  .strict();
export type WeeklyReviewPlanDay = z.infer<typeof WeeklyReviewPlanDay>;

/** ET-3, ET-4 — the durable payload of the `weekly_review` action. */
export const WeeklyReviewActionPayload = z
  .object({
    dedupeKey: z.string().min(1).max(200),
    weekKey: z.string().regex(/^\d{4}-W\d{2}$/),
    weekStart: CivilDate,
    weekEnd: CivilDate,
    nextWeekStart: CivilDate,
    reviewOn: IsoDateTime,
    studyMinutes: z.number().int().min(0),
    retention: WeeklyReviewRetention,
    atRiskNotions: z.array(WeeklyReviewAtRiskNotion),
    atRiskCount: z.number().int().min(0),
    plan: z.array(WeeklyReviewPlanDay).max(7),
    planMinutes: z.number().int().min(0),
    channel: WeeklyReviewChannel,
    availabilityHref: z.string().regex(/^\/(?!\/)/),
  })
  .strict();
export type WeeklyReviewActionPayload = z.infer<typeof WeeklyReviewActionPayload>;

/** EF-2 — the home card reads one projected review, with every label ready to render. */
export const WeeklyReviewView = z
  .object({
    actionId: Uuid,
    status: AutomationActionStatus,
    createdAt: IsoDateTime,
    weekKey: z.string().regex(/^\d{4}-W\d{2}$/),
    weekStart: CivilDate,
    weekEnd: CivilDate,
    nextWeekStart: CivilDate,
    /** « 2 – 8 nov. », computed in the learner's zone. */
    periodLabel: z.string().min(1).max(80),
    /** « reçu dim. 19:00 », computed in the learner's zone. */
    receivedLabel: z.string().min(1).max(80),
    studyMinutes: z.number().int().min(0),
    /** « 13 h », « 13 h 30 » or « 0 min ». */
    studyLabel: z.string().min(1).max(20),
    retention: WeeklyReviewRetention,
    /** « 86 % » or « Non disponible ». */
    retentionLabel: z.string().min(1).max(40),
    atRiskNotions: z.array(WeeklyReviewAtRiskNotion),
    atRiskCount: z.number().int().min(0),
    plan: z.array(WeeklyReviewPlanDay).max(7),
    planMinutes: z.number().int().min(0),
    channel: WeeklyReviewChannel,
    availabilityQuestion: z.boolean(),
    availabilityHref: z.string().regex(/^\/(?!\/)/),
    summary: z.string().min(1),
  })
  .strict();
export type WeeklyReviewView = z.infer<typeof WeeklyReviewView>;

/** EF-2, CL-4 — the card of a learner who has no review yet stays an explicit empty state. */
export const WeeklyReviewDto = z
  .object({
    available: z.boolean(),
    review: WeeklyReviewView.nullable(),
    timezone: z.string().min(1),
  })
  .strict();
export type WeeklyReviewDto = z.infer<typeof WeeklyReviewDto>;

/** CL-1 — an optional identifier narrows the read to one own review; a foreign id is a 404. */
export const WeeklyReviewQuery = z
  .object({
    actionId: Uuid.optional(),
  })
  .strict();
export type WeeklyReviewQuery = z.infer<typeof WeeklyReviewQuery>;

export const meWeeklyReviewGet = defineRoute({
  id: 'me.weekly-review.get',
  method: 'GET',
  path: '/api/v1/me/weekly-review',
  auth: 'user',
  query: WeeklyReviewQuery,
  output: WeeklyReviewDto,
  successStatus: 200,
  summary:
    'Bilan de la semaine du seul apprenant connecté : heures, rétention, notions à risque et plan de la semaine suivante (SPEC-720).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

export const weeklyReviewRoutes = { meWeeklyReviewGet } as const;

/** ET-3 — stable identity of one local week: user + ISO year-week of the Monday. */
export function weeklyReviewDedupeKey(userId: string, weekKey: string): string {
  return `weekly:${userId}:${weekKey}`;
}

/* ------------------------------------------------------------------ */
/* Pure display and week helpers (shared by the service and the UI)   */
/* ------------------------------------------------------------------ */

const MS_PER_DAY = 86_400_000;
const AT_RISK_MASTERY = 60;

function padNumber(value: number): string {
  return String(value).padStart(2, '0');
}

/** ISO year-week (`2026-W45`) of a civil Monday, computed in UTC from the given day. */
export function isoWeekKey(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return day;
  const target = new Date(date);
  const weekday = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
  return `${String(target.getUTCFullYear())}-W${padNumber(week)}`;
}

function civilDayOf(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function isoWeekdayOf(now: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(now);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name) + 1;
}

function shiftCivilDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  if (year === undefined || month === undefined || date === undefined) return day;
  const shifted = new Date(Date.UTC(year, month - 1, date) + days * MS_PER_DAY);
  return `${String(shifted.getUTCFullYear())}-${padNumber(shifted.getUTCMonth() + 1)}-${padNumber(shifted.getUTCDate())}`;
}

export interface WeeklyReviewWeek {
  weekKey: string;
  weekStart: string;
  /** Last day covered by the review: the local day of the trigger. */
  weekEnd: string;
  /** Monday of the following local week. */
  nextWeekStart: string;
  localDay: string;
  weekday: number;
}

/** ET-2, ET-3 — local week of the review from the injected instant and the IANA zone. */
export function weeklyReviewWeek(now: Date, timeZone: string): WeeklyReviewWeek {
  const localDay = civilDayOf(now, timeZone);
  const weekday = isoWeekdayOf(now, timeZone);
  const weekStart = shiftCivilDay(localDay, -(weekday - 1));
  return {
    weekKey: isoWeekKey(weekStart),
    weekStart,
    weekEnd: localDay,
    nextWeekStart: shiftCivilDay(weekStart, 7),
    localDay,
    weekday,
  };
}

/** BR-AUT-09 — `app` stays in-app; `app_email` adds the authorised e-mail delivery. */
export function weeklyReviewExternalChannels(
  channel: WeeklyReviewChannel,
): readonly ('email' | 'push')[] {
  return channel === 'app_email' ? ['email'] : [];
}

/** EF-2 — `13 h`, `13 h 30` or `0 min`, from real minutes. */
export function formatWeeklyStudy(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${String(rest)} min`;
  if (rest === 0) return `${String(hours)} h`;
  return `${String(hours)} h ${String(rest)}`;
}

/** CL-4 — a missing measure is « Non disponible », never 0 %. */
export function weeklyRetentionLabel(rate: number | null): string {
  return rate === null ? 'Non disponible' : `${String(Math.round(rate))} %`;
}

export interface AtRiskInput {
  notionId: string;
  label: string;
  mastery: number;
  dueAt: string | null;
  gapNature: string | null;
  gapClearedAt: string | null;
}

/**
 * EF-1, ET-4 — a notion is at risk when its mastery is below 60 and it is either due or carries an
 * open gap. The rule is pure and stable so the unit tests pin the ordering and the boundaries.
 */
export function isAtRiskNotion(notion: AtRiskInput, now: Date): boolean {
  if (notion.mastery >= AT_RISK_MASTERY) return false;
  if (notion.gapNature !== null && notion.gapClearedAt === null) return true;
  return notion.dueAt !== null && Date.parse(notion.dueAt) <= now.getTime();
}

export function sortAtRiskNotions(
  notions: readonly WeeklyReviewAtRiskNotion[],
): WeeklyReviewAtRiskNotion[] {
  return [...notions].sort((left, right) => {
    const mastery = left.mastery - right.mastery;
    if (mastery !== 0) return mastery;
    const label = left.label.localeCompare(right.label, 'fr');
    return label !== 0 ? label : left.notionId.localeCompare(right.notionId);
  });
}

export function sumPlanMinutes(plan: readonly WeeklyReviewPlanDay[]): number {
  return plan.reduce((total, day) => total + day.minutes, 0);
}

function shortDate(day: string): { day: string; month: string } {
  const instant = new Date(`${day}T12:00:00.000Z`);
  const parts = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).formatToParts(instant);
  return {
    day: parts.find((part) => part.type === 'day')?.value ?? day,
    month: parts.find((part) => part.type === 'month')?.value ?? '',
  };
}

/** EF-2 — « 2 – 8 nov. » in the profile zone, deterministic from the civil days. */
export function weeklyPeriodLabel(weekStart: string, weekEnd: string): string {
  const start = shortDate(weekStart);
  const end = shortDate(weekEnd);
  return start.month === end.month
    ? `${start.day} – ${end.day} ${end.month}`
    : `${start.day} ${start.month} – ${end.day} ${end.month}`;
}

/** EF-2 — « reçu dim. 19:00 ». */
export function weeklyReceivedLabel(instant: Date | string, timeZone: string): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  return `reçu ${new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date)}`;
}
