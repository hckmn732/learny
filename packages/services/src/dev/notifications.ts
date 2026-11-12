// Demonstration service of SPEC-209 (EF-8): simulated settings, clock and tone, then the real
// `notify` service. The learner's stored settings and tone are temporarily replaced and restored in
// a `finally`, so the demonstration never leaves the account altered.
import { eq } from 'drizzle-orm';

import type { DevNotifyInput, DevNotifyOutput } from '@learny/contracts';
import { AppError, userLocalDay } from '@learny/core';
import {
  listNotificationDeliveries,
  notificationSettings,
  notifications,
  schema,
  serviceDb,
} from '@learny/db';
import { heldBlock, notify } from '@learny/notifications';

import type { ServiceContext } from '../context';

const { profiles } = schema;

export async function runNotifyDemo(
  ctx: ServiceContext,
  input: DevNotifyInput,
): Promise<DevNotifyOutput> {
  if (ctx.userId === null) throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté.');
  const db = serviceDb();
  const [settings] = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, ctx.userId))
    .limit(1);
  const [profile] = await db
    .select({ tutorTone: profiles.tutorTone, timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.id, ctx.userId))
    .limit(1);
  if (profile === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');

  const at = new Date(input.at);
  const day = userLocalDay(at, profile.timezone);
  try {
    await db.update(profiles).set({ tutorTone: input.tone }).where(eq(profiles.id, ctx.userId));
    await db
      .update(notificationSettings)
      .set({
        channelEmail: input.settings.channelEmail,
        channelPush: input.settings.channelPush,
        typeRevision: input.settings.typeRevision,
        typeValidation: input.settings.typeValidation,
        typeCourse: input.settings.typeCourse,
        typeGap: input.settings.typeGap,
        typePlanning: input.settings.typePlanning,
        typeRelaunch: input.settings.typeRelaunch,
        quietStart: input.settings.quietStart,
        quietEnd: input.settings.quietEnd,
        weekendQuiet: input.settings.weekendQuiet,
        maxPerDay: input.settings.maxPerDay,
        updatedAt: ctx.clock.now(),
      })
      .where(eq(notificationSettings.userId, ctx.userId));

    const simulatedClock = { now: () => new Date(at.getTime()) };
    const result = await notify(
      {
        requestId: ctx.requestId,
        sdb: db,
        clock: simulatedClock,
        logger: ctx.logger,
      },
      {
        userId: ctx.userId,
        type: input.type,
        data: demoData(input),
        ...(input.dedupeKey === undefined ? {} : { dedupeKey: input.dedupeKey }),
      },
    );
    if (!result.ok) throw result.error;
    const [row] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, result.value.notificationId))
      .limit(1);
    if (row === undefined) throw new AppError('NOT_FOUND', 'Notification introuvable.');
    const held = await heldBlock(
      { sdb: db },
      {
        userId: ctx.userId,
        day: nextDay(day),
        timeZone: profile.timezone,
        maxPerDay: input.settings.maxPerDay,
      },
    );
    const journal = await db.transaction((tx) =>
      listNotificationDeliveries(tx, {
        userId: ctx.userId ?? '',
        notificationId: row.id,
      }),
    );
    return {
      notification: {
        id: row.id,
        type: row.type,
        icon: row.icon,
        title: row.title,
        body: row.body,
        href: row.href,
        createdAt: row.createdAt.toISOString(),
      },
      created: result.value.created,
      deliveries: journal.map((delivery) => ({
        channel: delivery.channel,
        status: delivery.status,
        scheduledFor: delivery.scheduledFor === null ? null : delivery.scheduledFor.toISOString(),
        error: delivery.error,
      })),
      digest: {
        heldCount: held.count,
        heldMaxPerDay: held.maxPerDay,
        heldTitles: held.titles,
      },
    };
  } finally {
    await db
      .update(profiles)
      .set({ tutorTone: profile.tutorTone })
      .where(eq(profiles.id, ctx.userId));
    if (settings !== undefined) {
      await db
        .update(notificationSettings)
        .set({
          channelEmail: settings.channelEmail,
          channelPush: settings.channelPush,
          typeRevision: settings.typeRevision,
          typeValidation: settings.typeValidation,
          typeCourse: settings.typeCourse,
          typeGap: settings.typeGap,
          typePlanning: settings.typePlanning,
          typeRelaunch: settings.typeRelaunch,
          quietStart: settings.quietStart,
          quietEnd: settings.quietEnd,
          weekendQuiet: settings.weekendQuiet,
          maxPerDay: settings.maxPerDay,
          updatedAt: settings.updatedAt,
        })
        .where(eq(notificationSettings.userId, ctx.userId));
    }
  }
}

function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const value = new Date(Date.UTC(year, month - 1, date));
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/** Sample data of the 16 types; the type alone decides the rendered text (ET-2). */
function demoData(input: DevNotifyInput): Record<string, unknown> {
  return {
    formationTitle: 'SAP S/4HANA Finance',
    moduleTitle: 'Comptabilité générale',
    notionTitle: 'Saisie des pièces comptables',
    title: 'Séance de travail',
    when: input.at.slice(0, 10),
    minutes: 20,
    notions: 14,
    activityCount: 5,
    plannedLabel: '5 h',
    studyLabel: '13 h',
    percent: 85,
    taskLabel: 'Génération du cours',
    groupTitle: 'Promotion Finance',
    href: '/aujourdhui',
  };
}
