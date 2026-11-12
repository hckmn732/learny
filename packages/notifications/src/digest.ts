// Programme du jour (SPEC-209 EF-6, CA-3, ADR-0265).
//
// At the learner's `digest_time` the job creates the `daily_digest` notification and its service
// e-mail with the activities of the local day (at most 20 in the mail, the rest summarised in
// `plannedLabel`) and the block “En attente dans l’application”: the distinct notifications capped
// the previous local day, at most ten titles. The digest never consumes the daily cap (ADR-0214).
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';

import { startOfUserDay, endOfUserDay, userLocalDay } from '@learny/core';
import {
  notificationDeliveries,
  notificationSettings,
  notifications,
  schema,
  scheduleSlots,
} from '@learny/db';

import { notify, type NotifySystemContext } from './notify';

const { formations, profiles } = schema;

export const DIGEST_ACTIVITY_LIMIT = 20;
export const DIGEST_HELD_LIMIT = 10;

const SLOT_LABELS: Record<string, string> = {
  contributions: 'Contributions',
  course: 'Cours',
  exercise: 'Exercice',
  validation_quiz: 'Quiz de validation',
  global_quiz: 'Quiz global',
  revision: 'Révision',
  buffer: 'Marge',
  sprint: 'Sprint',
  mock_exam: 'Examen blanc',
  warmup: 'Échauffement',
  micro_session: 'Micro-séance',
  weekly_review: 'Bilan de la semaine',
};

function previousCivilDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const value = new Date(Date.UTC(year, month - 1, date));
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function hhmm(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  if (rest === 0) return `${String(hours)} h`;
  return `${String(hours)} h ${String(rest).padStart(2, '0')}`;
}

export interface DigestData {
  dateLabel: string;
  plannedLabel: string;
  activityCount: number;
  activities: {
    time: string;
    title: string;
    detail: string;
    formationTitle: string;
  }[];
  globalQuiz: { notions: number; minutes: number; formationTitle: string } | null;
  held: { count: number; maxPerDay: 3 | 5 | 8; titles: string[] } | null;
}

/** Reads the local day's schedule and the capped notifications of the previous local day. */
export async function buildDigestData(
  ctx: Pick<NotifySystemContext, 'sdb'>,
  userId: string,
  day: string,
  timeZone: string,
): Promise<DigestData> {
  const bounds = { start: startOfUserDay(day, timeZone), end: endOfUserDay(day, timeZone) };

  const slots = await ctx.sdb
    .select({
      kind: scheduleSlots.kind,
      title: scheduleSlots.title,
      meta: scheduleSlots.meta,
      startsAt: scheduleSlots.startsAt,
      endsAt: scheduleSlots.endsAt,
      formationTitle: formations.title,
    })
    .from(scheduleSlots)
    .innerJoin(formations, eq(formations.id, scheduleSlots.formationId))
    .where(
      and(
        eq(scheduleSlots.userId, userId),
        inArray(scheduleSlots.status, ['planned', 'done']),
        lt(scheduleSlots.startsAt, bounds.end),
        gte(scheduleSlots.endsAt, bounds.start),
      ),
    )
    .orderBy(asc(scheduleSlots.startsAt));

  const minutes = slots.reduce(
    (total, slot) =>
      total + Math.max(0, Math.round((slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000)),
    0,
  );
  const hidden = Math.max(0, slots.length - DIGEST_ACTIVITY_LIMIT);
  const planned = durationLabel(minutes);
  const plannedLabel =
    hidden === 0 ? planned : `${planned} et ${String(hidden)} autres dans l’agenda`;

  const activities = slots.slice(0, DIGEST_ACTIVITY_LIMIT).map((slot) => ({
    time: hhmm(slot.startsAt, timeZone),
    title: slot.title,
    detail: slot.meta ?? SLOT_LABELS[slot.kind] ?? '',
    formationTitle: slot.formationTitle,
  }));

  const globalQuizSlot = slots.find((slot) => slot.kind === 'global_quiz');
  const globalQuiz =
    globalQuizSlot === undefined
      ? null
      : {
          notions: 1,
          minutes: Math.max(
            1,
            Math.round(
              (globalQuizSlot.endsAt.getTime() - globalQuizSlot.startsAt.getTime()) / 60_000,
            ),
          ),
          formationTitle: globalQuizSlot.formationTitle,
        };

  const previousDay = previousCivilDay(day);
  const previous = {
    start: startOfUserDay(previousDay, timeZone),
    end: bounds.start,
  };
  const capped = await ctx.sdb
    .select({ id: notifications.id, title: notifications.title })
    .from(notificationDeliveries)
    .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notificationDeliveries.status, 'capped'),
        gte(notifications.createdAt, previous.start),
        lt(notifications.createdAt, previous.end),
      ),
    )
    .orderBy(asc(notifications.createdAt))
    .groupBy(notifications.id, notifications.title);

  let held: DigestData['held'] = null;
  if (capped.length > 0) {
    const [settings] = await ctx.sdb
      .select({ maxPerDay: notificationSettings.maxPerDay })
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .limit(1);
    held = {
      count: capped.length,
      maxPerDay: settings?.maxPerDay === 3 || settings?.maxPerDay === 8 ? settings.maxPerDay : 5,
      titles: capped.slice(0, DIGEST_HELD_LIMIT).map((row) => row.title),
    };
  }

  return {
    dateLabel: new Intl.DateTimeFormat('fr-FR', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(bounds.start),
    plannedLabel,
    activityCount: slots.length,
    activities,
    globalQuiz,
    held,
  };
}

export interface DigestOutcome {
  notificationId: string | null;
  created: boolean;
  heldCount: number;
}

/** EF-6, ET-6 — creates the digest of one learner for one local day, idempotently. */
export async function sendDailyDigest(
  ctx: NotifySystemContext,
  input: { userId: string; at: Date; timeZone: string },
  deps: Parameters<typeof notify>[2] = {},
): Promise<DigestOutcome> {
  const day = userLocalDay(input.at, input.timeZone);
  const [profile] = await ctx.sdb
    .select({
      timezone: profiles.timezone,
      tutorTone: profiles.tutorTone,
      firstName: profiles.firstName,
    })
    .from(profiles)
    .where(eq(profiles.id, input.userId))
    .limit(1);
  if (profile === undefined) return { notificationId: null, created: false, heldCount: 0 };

  const data = await buildDigestData(ctx, input.userId, day, profile.timezone);
  const result = await notify(
    ctx,
    {
      userId: input.userId,
      type: 'daily_digest',
      data: {
        ...data,
        href: '/aujourdhui',
        formationTitle: null,
      },
      dedupeKey: `digest:${input.userId}:${day}`,
      eligibleAt: input.at.toISOString(),
    },
    deps,
  );
  if (!result.ok) throw result.error;
  return {
    notificationId: result.value.notificationId,
    created: result.value.created,
    heldCount: data.held?.count ?? 0,
  };
}

/** EF-6 — the capped notifications of the previous day, as shown by the demonstration. */
export async function heldBlock(
  ctx: Pick<NotifySystemContext, 'sdb'>,
  input: { userId: string; day: string; timeZone: string; maxPerDay: 3 | 5 | 8 },
): Promise<{ count: number; maxPerDay: 3 | 5 | 8; titles: string[] }> {
  const start = startOfUserDay(input.day, input.timeZone);
  const previousDay = previousCivilDay(input.day);
  const previous = startOfUserDay(previousDay, input.timeZone);
  const rows = await ctx.sdb
    .select({ id: notifications.id, title: notifications.title })
    .from(notificationDeliveries)
    .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
    .where(
      and(
        eq(notifications.userId, input.userId),
        eq(notificationDeliveries.status, 'capped'),
        gte(notifications.createdAt, previous),
        lt(notifications.createdAt, start),
      ),
    )
    .orderBy(asc(notifications.createdAt))
    .groupBy(notifications.id, notifications.title);
  return {
    count: rows.length,
    maxPerDay: input.maxPerDay,
    titles: rows.slice(0, DIGEST_HELD_LIMIT).map((row) => row.title),
  };
}
