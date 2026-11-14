// Integration tests of the notification producers (SPEC-706 §12, CA-1 to CA-3).
//
// Postgres is real: the in-app rows, the deliveries and the dedupe keys are read back after the
// committed transaction. Another learner's formation is a 404, an invalid fact a 400, a stale slot
// a 409 and a replayed event writes nothing else.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { NotificationProducerType } from '@learny/contracts';
import { AppError, ERROR_CATALOG } from '@learny/core';
import { schema, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { createScheduleSlot } from '@learny/testing';
import { createFixedClock } from '@learny/testing';

import { createServiceContext } from '../../src/context';
import {
  generateNotificationDemo,
  produceNotifications,
  scheduleValidationQuizReminder,
  syncRemindersForJobs,
  type NotificationProducerContext,
} from '../../src/notifications-generation-des-rappels';

const { notificationDeliveries, notifications, scheduleSlots } = schema;
const PREFIX = 'sdd-706-';
const NOW = '2026-11-11T12:20:00Z';
const QUIZ_15_PARIS = '2026-11-11T14:00:00.000Z'; // 15:00 Europe/Paris
const QUIZ_16_PARIS = '2026-11-11T15:00:00.000Z'; // 16:00 Europe/Paris

interface Fixture {
  userId: string;
  formationId: string;
  moduleId: string;
}

async function cleanup(): Promise<void> {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
}

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

function context(userId: string | null): NotificationProducerContext {
  const base = createServiceContext({
    userId,
    requestId: `spec-706-${randomUUID()}`,
    clock: createFixedClock(NOW),
  });
  return { ...base, sdb: serviceDb() };
}

async function seed(label: string): Promise<Fixture> {
  return serviceDb().transaction(async (tx) => {
    const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
    const user = await createTestUser(tx, { email });
    await tx.execute(sql`
      update public.profiles
      set timezone = 'Europe/Paris', tutor_tone = 'vous', onboarding_step = 'done'
      where id = ${user.id}::uuid
    `);
    const programme = await createTestProgramme(tx, user.id, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'SAP S/4HANA Finance',
    });
    return {
      userId: user.id,
      formationId: programme.formationId,
      moduleId: programme.moduleIds[0] ?? '',
    };
  });
}

async function countNotifications(userId: string): Promise<number> {
  const rows = await serviceDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(sql`${notifications.userId} = ${userId}::uuid`);
  return rows[0]?.count ?? 0;
}

async function typeList(userId: string): Promise<NotificationProducerType[]> {
  const rows = await serviceDb()
    .select({ type: notifications.type })
    .from(notifications)
    .where(sql`${notifications.userId} = ${userId}::uuid`);
  return rows.map((row) => row.type as NotificationProducerType).sort();
}

describe('[SPEC-706] service et API', () => {
  it('CA-1 — les treize types sont écrits une seule fois, avec leurs livraisons', async () => {
    const fixture = await seed('all');
    const ctx = context(fixture.userId);

    const created = await generateNotificationDemo(ctx, {});
    expect(created.notifications).toHaveLength(12);
    expect(created.reminder).not.toBeNull();
    expect(created.reminder?.schedule.localTime).toBe('14:20');

    const rows = await serviceDb()
      .select({
        id: notifications.id,
        type: notifications.type,
        dedupeKey: notifications.dedupeKey,
      })
      .from(notifications)
      .where(sql`${notifications.userId} = ${fixture.userId}::uuid`);
    expect(rows).toHaveLength(13);
    expect(new Set(rows.map((row) => row.type)).size).toBe(13);
    expect((await typeList(fixture.userId)).join(',')).toBe(
      [
        'ai_cost_alert',
        'ai_task_failed',
        'course_ready',
        'export_ready',
        'global_quiz_today',
        'group_invitation',
        'milestone',
        'module_validated',
        'new_gap',
        'session_planned',
        'session_to_reschedule',
        'validation_soon',
        'weekly_review',
      ].join(','),
    );
    for (const row of rows) expect(row.dedupeKey).not.toBeNull();

    // CL-3 — a replayed event creates no row and no second delivery.
    const deliveriesBefore = await serviceDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationDeliveries).where(sql`
        ${notificationDeliveries.notificationId} in (
          select id from public.notifications where user_id = ${fixture.userId}::uuid
        )
      `);
    const replay = await generateNotificationDemo(ctx, {});
    expect(replay.notifications.every((item) => item.created)).toBe(false);
    expect(replay.reminder?.created).toBe(false);
    expect(await countNotifications(fixture.userId)).toBe(13);
    const deliveriesAfter = await serviceDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationDeliveries).where(sql`
        ${notificationDeliveries.notificationId} in (
          select id from public.notifications where user_id = ${fixture.userId}::uuid
        )
      `);
    expect(deliveriesAfter[0]?.count).toBe(deliveriesBefore[0]?.count);
  });

  it('CA-2 — un quiz à 15:00 est rappelé à 14:20, un déplacement remplace l’ancien rappel', async () => {
    const fixture = await seed('reminder');
    const slotId = await serviceDb().transaction(async (tx) => {
      const slot = await createScheduleSlot(tx, {
        userId: fixture.userId,
        formationId: fixture.formationId,
        moduleId: fixture.moduleId,
        kind: 'validation_quiz',
        title: 'Quiz de validation',
        startsAt: new Date(QUIZ_15_PARIS),
        endsAt: new Date('2026-11-11T15:00:00.000Z'),
      });
      return slot.id;
    });
    const ctx = context(fixture.userId);
    const input = {
      userId: fixture.userId,
      formationId: fixture.formationId,
      slotId,
      moduleId: fixture.moduleId,
      moduleTitle: 'Comptabilité générale',
      startsAt: QUIZ_15_PARIS,
      timezone: 'Europe/Paris',
    };

    const first = await scheduleValidationQuizReminder(ctx, input);
    if (!first.ok) throw first.error;
    expect(first.value.expired).toBe(false);
    expect(first.value.schedule.localTime).toBe('15:00');
    expect(first.value.schedule.eligibleAt).toBe('2026-11-11T13:20:00.000Z'); // 14:20 Paris
    expect(first.value.schedule.dedupeKey).toBe(`validation_soon:${slotId}:${QUIZ_15_PARIS}`);
    expect(first.value.created).toBe(true);

    const deliveries = await serviceDb()
      .select({
        channel: notificationDeliveries.channel,
        status: notificationDeliveries.status,
        scheduledFor: notificationDeliveries.scheduledFor,
      })
      .from(notificationDeliveries)
      .where(sql`${notificationDeliveries.notificationId} = ${first.value.notificationId}::uuid`)
      .orderBy(notificationDeliveries.channel);
    expect(deliveries.map((row) => row.channel)).toEqual(['email', 'push']);
    for (const delivery of deliveries) {
      expect(delivery.status).toBe('scheduled');
      expect(delivery.scheduledFor?.toISOString()).toBe('2026-11-11T13:20:00.000Z');
    }

    // The move updates the slot first, then the producer schedules the new reminder.
    await serviceDb()
      .update(scheduleSlots)
      .set({ startsAt: new Date(QUIZ_16_PARIS), endsAt: new Date('2026-11-11T16:00:00.000Z') })
      .where(sql`${scheduleSlots.id} = ${slotId}::uuid`);

    const moved = await scheduleValidationQuizReminder(ctx, {
      ...input,
      startsAt: QUIZ_16_PARIS,
    });
    if (!moved.ok) throw moved.error;
    expect(moved.value.cancelled).toBe(1);
    expect(moved.value.schedule.localTime).toBe('16:00');
    expect(moved.value.schedule.eligibleAt).toBe('2026-11-11T14:20:00.000Z'); // 15:20 Paris
    expect(moved.value.schedule.dedupeKey).not.toBe(first.value.schedule.dedupeKey);

    const reminders = await serviceDb()
      .select({ id: notifications.id, dedupeKey: notifications.dedupeKey })
      .from(notifications).where(sql`
        ${notifications.userId} = ${fixture.userId}::uuid
        and ${notifications.type} = 'validation_soon'
      `);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.id).not.toBe(first.value.notificationId);
    expect(reminders[0]?.dedupeKey).toBe(moved.value.schedule.dedupeKey);
  });

  it('CL-5 — un rappel calculé dans le passé n’est pas envoyé tardivement', async () => {
    const fixture = await seed('expired');
    const startsAt = '2026-11-11T12:40:00.000Z'; // reminder at 12:00, before the clock
    const slotId = await serviceDb().transaction(async (tx) => {
      const slot = await createScheduleSlot(tx, {
        userId: fixture.userId,
        formationId: fixture.formationId,
        moduleId: fixture.moduleId,
        kind: 'validation_quiz',
        startsAt: new Date(startsAt),
        endsAt: new Date('2026-11-11T13:40:00.000Z'),
      });
      return slot.id;
    });
    const ctx = context(fixture.userId);
    const result = await scheduleValidationQuizReminder(ctx, {
      userId: fixture.userId,
      formationId: fixture.formationId,
      slotId,
      startsAt,
      timezone: 'Europe/Paris',
    });
    if (!result.ok) throw result.error;
    expect(result.value.expired).toBe(true);
    expect(result.value.notificationId).toBeNull();
    expect(await countNotifications(fixture.userId)).toBe(0);
  });

  it('CL-2 — un producteur périmé reçoit 409 et l’état actuel du créneau', async () => {
    const fixture = await seed('conflict');
    const slotId = await serviceDb().transaction(async (tx) => {
      const slot = await createScheduleSlot(tx, {
        userId: fixture.userId,
        formationId: fixture.formationId,
        kind: 'validation_quiz',
        startsAt: new Date(QUIZ_15_PARIS),
        endsAt: new Date('2026-11-11T15:00:00.000Z'),
      });
      return slot.id;
    });
    await serviceDb()
      .update(scheduleSlots)
      .set({ startsAt: new Date(QUIZ_16_PARIS), endsAt: new Date('2026-11-11T16:00:00.000Z') })
      .where(sql`${scheduleSlots.id} = ${slotId}::uuid`);

    const ctx = context(fixture.userId);
    const result = await scheduleValidationQuizReminder(ctx, {
      userId: fixture.userId,
      formationId: fixture.formationId,
      slotId,
      startsAt: QUIZ_15_PARIS,
      timezone: 'Europe/Paris',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(AppError);
    expect(result.error.code).toBe('CONFLICT');
    expect(ERROR_CATALOG.CONFLICT.status).toBe(409);
    expect(result.error.errors?.[0]?.path).toBe('startsAt');
    expect(result.error.errors?.[0]?.message).toBe(QUIZ_16_PARIS);
    expect(await countNotifications(fixture.userId)).toBe(0);
  });

  it('CA-3 — un autre utilisateur ne voit rien et une donnée invalide n’écrit rien', async () => {
    const owner = await seed('owner');
    const stranger = await seed('stranger');
    const ctx = context(stranger.userId);

    const foreign = await produceNotifications(ctx, [
      {
        kind: 'course_ready',
        userId: stranger.userId,
        formationId: owner.formationId,
        courseId: '55555555-5555-4555-8555-555555555555',
      },
    ]);
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) {
      expect(foreign.error.code).toBe('NOT_FOUND');
      expect(ERROR_CATALOG.NOT_FOUND.status).toBe(404);
    }
    expect(await countNotifications(stranger.userId)).toBe(0);

    const invalid = await produceNotifications(ctx, [
      { kind: 'course_ready', userId: stranger.userId, courseId: 'pas-un-uuid' },
    ]);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.code).toBe('VALIDATION_FAILED');
      expect(ERROR_CATALOG.VALIDATION_FAILED.status).toBe(400);
    }
    expect(await countNotifications(stranger.userId)).toBe(0);
  });

  it('CA-3 — un utilisateur ne peut pas produire pour le compte d’un autre', async () => {
    const owner = await seed('scope-owner');
    const stranger = await seed('scope-stranger');
    const ctx = context(stranger.userId);
    const result = await produceNotifications(ctx, [
      {
        kind: 'course_ready',
        userId: owner.userId,
        formationId: owner.formationId,
        courseId: '66666666-6666-4666-8666-666666666666',
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    expect(await countNotifications(owner.userId)).toBe(0);
  });

  it('CA-1 — le texte suit le ton du profil (vous/tu)', async () => {
    const fixture = await seed('tone');
    await serviceDb().execute(sql`
      update public.profiles set tutor_tone = 'tu' where id = ${fixture.userId}::uuid
    `);
    const ctx = context(fixture.userId);
    const tu = await produceNotifications(ctx, [
      {
        kind: 'course_ready',
        userId: fixture.userId,
        formationId: fixture.formationId,
        courseId: '77777777-7777-4777-8777-777777777777',
        moduleTitle: 'Comptabilité générale',
      },
    ]);
    if (!tu.ok) throw tu.error;
    expect(tu.value[0]?.title).toBe('Ton cours est prêt');

    await serviceDb().execute(sql`
      update public.profiles set tutor_tone = 'vous' where id = ${fixture.userId}::uuid
    `);
    const vous = await produceNotifications(ctx, [
      {
        kind: 'course_ready',
        userId: fixture.userId,
        formationId: fixture.formationId,
        courseId: '88888888-8888-4888-8888-888888888888',
        moduleTitle: 'Comptabilité générale',
      },
    ]);
    if (!vous.ok) throw vous.error;
    expect(vous.value[0]?.title).toBe('Votre cours est prêt');
  });

  it('ET-6 — le job horaire génère les rappels de l’heure, sans doublon', async () => {
    const fixture = await seed('job');
    const slotId = await serviceDb().transaction(async (tx) => {
      const slot = await createScheduleSlot(tx, {
        userId: fixture.userId,
        formationId: fixture.formationId,
        moduleId: fixture.moduleId,
        kind: 'validation_quiz',
        title: 'Quiz de validation',
        startsAt: new Date(QUIZ_15_PARIS),
        endsAt: new Date('2026-11-11T15:00:00.000Z'),
      });
      return slot.id;
    });
    const ctx = context(null);
    const first = await syncRemindersForJobs(ctx);
    if (!first.ok) throw first.error;
    expect(first.value.produced).toBeGreaterThanOrEqual(1);
    expect(first.value.created).toBeGreaterThanOrEqual(1);
    const second = await syncRemindersForJobs(ctx);
    if (!second.ok) throw second.error;
    expect(second.value.created).toBe(0);

    const row = await serviceDb()
      .select({ id: notifications.id, dedupeKey: notifications.dedupeKey })
      .from(notifications).where(sql`
        ${notifications.userId} = ${fixture.userId}::uuid
        and ${notifications.type} = 'validation_soon'
      `);
    expect(row).toHaveLength(1);
    expect(row[0]?.dedupeKey).toBe(`validation_soon:${slotId}:${QUIZ_15_PARIS}`);
  });
});
