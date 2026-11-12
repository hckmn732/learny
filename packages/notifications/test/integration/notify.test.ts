// Integration tests of the unified notification service (SPEC-209 §12): real Postgres, memory
// e-mail transport and mock push transport. Each learner is a factory user deleted afterwards.
import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clock } from '@learny/core';
import { logger } from '@learny/core/server';
import { closeDb, schema, serviceDb } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { deliverDelivery, listDueDeliveries, notify, sendDailyDigest } from '@learny/notifications';

import { clearOutbox, listOutbox, memoryTransport, setTransport } from '../../src/email/index';

const PREFIX = 'sdd-209-';
const { notificationDeliveries, notificationSettings, notifications, profiles } = schema;

interface Learner {
  id: string;
  email: string;
}

const learners: Learner[] = [];

function ctx(at: Date) {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock: { now: () => new Date(at.getTime()) },
    logger,
  };
}

async function createLearner(
  options: {
    tone?: 'vous' | 'tu';
    timezone?: string;
    channelEmail?: boolean;
    channelPush?: boolean;
    weekendQuiet?: boolean;
    maxPerDay?: 3 | 5 | 8;
    quietStart?: string;
    quietEnd?: string;
  } = {},
): Promise<Learner> {
  const email = `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`;
  const id = await serviceDb().transaction(
    async (tx) =>
      (
        await createTestUser(tx, {
          email,
          firstName: 'Alex',
          timezone: options.timezone ?? 'Europe/Paris',
        })
      ).id,
  );
  const learner = { id, email };
  learners.push(learner);
  await serviceDb()
    .update(profiles)
    .set({ tutorTone: options.tone ?? 'vous' })
    .where(eq(profiles.id, id));
  await serviceDb()
    .update(notificationSettings)
    .set({
      channelEmail: options.channelEmail ?? true,
      channelPush: options.channelPush ?? true,
      weekendQuiet: options.weekendQuiet ?? true,
      maxPerDay: options.maxPerDay ?? 5,
      quietStart: options.quietStart ?? '21:00',
      quietEnd: options.quietEnd ?? '08:00',
      updatedAt: clock.now(),
    })
    .where(eq(notificationSettings.userId, id));
  return learner;
}

function input(learner: Learner, overrides: Record<string, unknown> = {}) {
  return {
    userId: learner.id,
    type: 'course_ready',
    data: { moduleTitle: 'Comptabilité générale', formationTitle: 'SAP S/4HANA Finance' },
    ...overrides,
  };
}

async function journal(notificationId: string) {
  return serviceDb()
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.notificationId, notificationId));
}

beforeAll(() => {
  setTransport(memoryTransport);
});

beforeEach(() => {
  clearOutbox();
});

afterEach(() => {
  clearOutbox();
});

afterAll(async () => {
  if (learners.length > 0) {
    for (const learner of learners) {
      await serviceDb().execute(sql`delete from auth.users where id = ${learner.id}::uuid`);
    }
  }
  await closeDb();
});

describe('[SPEC-209] notify', () => {
  it('CA-1, BR-NOT-03 — la notification in-app est toujours créée, les canaux écartés sont journalisés', async () => {
    const learner = await createLearner({ channelEmail: false, channelPush: false });
    const result = await notify(
      ctx(new Date('2026-11-11T12:20:00Z')),
      input(learner, { type: 'validation_soon' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created).toBe(true);
    expect(result.value.deliveries.map((row) => row.status)).toEqual([
      'skipped_pref',
      'skipped_pref',
    ]);
    const [row] = await serviceDb()
      .select()
      .from(notifications)
      .where(eq(notifications.id, result.value.notificationId));
    expect(row?.title).toBe('Votre quiz de validation approche');
    expect(row?.href.startsWith('/')).toBe(true);
  });

  it('CA-5, CL-8 — le ton tu s’applique au titre, sans vouvoiement', async () => {
    const learner = await createLearner({ tone: 'tu', channelEmail: false, channelPush: false });
    const result = await notify(
      ctx(new Date('2026-11-11T12:20:00Z')),
      input(learner, { type: 'course_ready' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await serviceDb()
      .select()
      .from(notifications)
      .where(eq(notifications.id, result.value.notificationId));
    expect(row?.title).toBe('Ton cours est prêt');
    expect(/\b(vous|votre|vos)\b/iu.test(`${row?.title ?? ''} ${row?.body ?? ''}`)).toBe(false);
  });

  it('CA-4, CL-4 — la même dedupeKey ne crée ni notification ni livraison', async () => {
    const learner = await createLearner();
    const at = new Date('2026-11-11T12:20:00Z');
    const first = await notify(ctx(at), input(learner, { dedupeKey: 'same-key' }));
    const second = await notify(ctx(at), input(learner, { dedupeKey: 'same-key' }));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.notificationId).toBe(second.value.notificationId);
    expect(second.value.created).toBe(false);
    expect(second.value.deliveries).toHaveLength(2);
    const rows = await serviceDb()
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.dedupeKey, 'same-key'));
    expect(rows).toHaveLength(1);
  });

  it('CA-2, CL-1 — à 22:30, e-mail et navigateur sont reportés à 08:00 locales', async () => {
    const learner = await createLearner();
    const result = await notify(
      ctx(new Date('2026-11-11T21:30:00Z')),
      input(learner, { type: 'validation_soon' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deliveries).toEqual([
      {
        channel: 'email',
        status: 'deferred_quiet',
        scheduledFor: '2026-11-12T07:00:00.000Z',
      },
      {
        channel: 'push',
        status: 'deferred_quiet',
        scheduledFor: '2026-11-12T07:00:00.000Z',
      },
    ]);
    expect(listOutbox()).toHaveLength(0);
  });

  it('CA-2, EF-4, CL-9 — le samedi, seules les révisions dues sortent ; le reste part lundi', async () => {
    const learner = await createLearner();
    const saturday = new Date('2026-11-14T09:00:00Z');
    const revision = await notify(
      ctx(saturday),
      input(learner, { type: 'global_quiz_today', dedupeKey: 'revision-saturday' }),
    );
    expect(revision.ok).toBe(true);
    if (!revision.ok) return;
    expect(revision.value.deliveries[0]).toEqual({
      channel: 'email',
      status: 'sent',
      scheduledFor: null,
    });

    const course = await notify(
      ctx(saturday),
      input(learner, { type: 'course_ready', dedupeKey: 'course-saturday' }),
    );
    expect(course.ok).toBe(true);
    if (!course.ok) return;
    expect(course.value.deliveries[0]).toEqual({
      channel: 'email',
      status: 'deferred_quiet',
      scheduledFor: '2026-11-16T07:00:00.000Z',
    });
  });

  it('CA-3, CL-3 — le plafond n’est jamais dépassé sous dix appels concurrents', async () => {
    const learner = await createLearner({ maxPerDay: 3 });
    const at = new Date('2026-11-11T12:20:00Z');
    const results = await Promise.all(
      Array.from({ length: 10 }, (_value, index) =>
        notify(
          ctx(at),
          input(learner, { type: 'milestone', dedupeKey: `concurrent-${String(index)}` }),
        ),
      ),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    const rows = await serviceDb().execute<{ count: number }>(sql`
      select count(distinct d.notification_id)::int as count
      from public.notification_deliveries d
      join public.notifications n on n.id = d.notification_id
      where n.user_id = ${learner.id}::uuid and d.status = 'sent'
    `);
    expect(rows[0]?.count).toBe(3);
    const capped = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count
      from public.notification_deliveries d
      join public.notifications n on n.id = d.notification_id
      where n.user_id = ${learner.id}::uuid and d.status = 'capped'
    `);
    expect(capped[0]?.count).toBe(14);
  });

  it('CA-2, CL-5 — une livraison reportée devient sans objet si la notification est lue', async () => {
    const learner = await createLearner();
    const evening = new Date('2026-11-11T21:30:00Z');
    const created = await notify(ctx(evening), input(learner, { dedupeKey: 'read-before-quiet' }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const due = await listDueDeliveries({ sdb: serviceDb() }, new Date('2026-11-12T07:00:00Z'), 10);
    const email = due.find((row) => row.notificationId === created.value.notificationId);
    expect(email).toBeDefined();
    await serviceDb()
      .update(notifications)
      .set({ readAt: new Date('2026-11-11T22:00:00Z') })
      .where(eq(notifications.id, created.value.notificationId));
    const outcome = await deliverDelivery(ctx(new Date('2026-11-12T07:00:00Z')), email?.id ?? '');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.status).toBe('skipped_pref');
    expect(outcome.value.error).toBe('stale');
    expect(listOutbox()).toHaveLength(0);
  });

  it('CA-4, EF-5 — la livraison reportée part une seule fois, même rejouée', async () => {
    const learner = await createLearner();
    const evening = new Date('2026-11-11T21:30:00Z');
    const created = await notify(ctx(evening), input(learner, { dedupeKey: 'deferred-ok' }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const due = await listDueDeliveries({ sdb: serviceDb() }, new Date('2026-11-12T07:00:00Z'), 50);
    const email = due.find((row) => row.notificationId === created.value.notificationId);
    expect(email).toBeDefined();
    const first = await deliverDelivery(ctx(new Date('2026-11-12T07:00:00Z')), email?.id ?? '');
    const replay = await deliverDelivery(ctx(new Date('2026-11-12T07:00:00Z')), email?.id ?? '');
    expect(first.ok && replay.ok).toBe(true);
    if (!first.ok || !replay.ok) return;
    expect(first.value.status).toBe('sent');
    expect(replay.value.skipped).toBe(true);
    expect(listOutbox()).toHaveLength(1);
    const rows = await journal(created.value.notificationId);
    expect(rows.find((row) => row.channel === 'email')?.status).toBe('sent');
  });

  it('CA-3, EF-6 — le programme du jour contient le bloc des envois écartés de la veille', async () => {
    const learner = await createLearner({ maxPerDay: 3 });
    const yesterday = new Date('2026-11-10T12:20:00Z');
    for (let index = 0; index < 4; index += 1) {
      const result = await notify(
        ctx(yesterday),
        input(learner, { type: 'milestone', dedupeKey: `held-${String(index)}` }),
      );
      expect(result.ok).toBe(true);
    }
    clearOutbox();
    const digest = await sendDailyDigest(ctx(new Date('2026-11-11T07:00:00Z')), {
      userId: learner.id,
      at: new Date('2026-11-11T07:00:00Z'),
      timeZone: 'Europe/Paris',
    });
    expect(digest.created).toBe(true);
    expect(digest.heldCount).toBe(1);
    const [row] = await serviceDb()
      .select()
      .from(notifications)
      .where(eq(notifications.id, digest.notificationId ?? ''));
    expect(row?.type).toBe('daily_digest');
    const outbox = listOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.message.subject).toContain('programme');
    expect(outbox[0]?.message.html).toContain('limite de 3 par jour');
    const replay = await sendDailyDigest(ctx(new Date('2026-11-11T07:00:00Z')), {
      userId: learner.id,
      at: new Date('2026-11-11T07:00:00Z'),
      timeZone: 'Europe/Paris',
    });
    expect(replay.created).toBe(false);
    expect(listOutbox()).toHaveLength(1);
  });

  it('CA-3, EF-7 — un échec de transport passe la livraison failed et ne compte pas au plafond', async () => {
    const learner = await createLearner({ maxPerDay: 3 });
    const failing = {
      name: 'failing',
      send: () => Promise.reject(new Error('transport down')),
    };
    setTransport(failing);
    const failed = await notify(
      ctx(new Date('2026-11-11T12:20:00Z')),
      input(learner, { type: 'milestone', dedupeKey: 'failed-transport' }),
    );
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    const rows = await journal(failed.value.notificationId);
    expect(rows.find((row) => row.channel === 'email')?.status).toBe('failed');
    const counted = await serviceDb().execute<{ count: number }>(sql`
      select count(distinct d.notification_id)::int as count
      from public.notification_deliveries d
      join public.notifications n on n.id = d.notification_id
      where n.user_id = ${learner.id}::uuid and d.status = 'sent'
    `);
    expect(counted[0]?.count).toBe(0);
    setTransport(memoryTransport);
    const sent = await notify(
      ctx(new Date('2026-11-11T12:21:00Z')),
      input(learner, { type: 'milestone', dedupeKey: 'after-failure' }),
    );
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.value.deliveries[0]?.status).toBe('sent');
  });
});
