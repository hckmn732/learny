// Integration tests of the Notifications tab service (SPEC-708 §12, CA-1 to CA-4).
//
// Real Postgres with RLS (Supabase local), the real `notification_settings` row created by the
// sign-up trigger and real `push_subscriptions`. The clock is frozen at 2026-11-11T12:20:00Z
// (ADR-0047) and the AI stays mocked (ADR-0048): the capacity writes no AI call. Users are created
// by factory with the `sdd-708-` prefix and deleted in afterEach, cascade included.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, pushSubscriptions, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createFixedClock } from '@learny/testing';

import { createServiceContext } from '../../src/context';
import {
  getNotificationSettings,
  previewTestNotification,
  updateNotificationSettings,
} from '../../src/parametres-notifications';

const PREFIX = 'sdd-708-';
const FIXED = createFixedClock();

interface TestUser {
  userId: string;
  email: string;
}

const createdUsers: string[] = [];

function clockAt(iso: string): Clock {
  return { now: () => new Date(iso) };
}

async function createUser(label: string): Promise<TestUser> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const userId = await serviceDb().transaction(
    async (tx) => (await createTestUser(tx, { email })).id,
  );
  createdUsers.push(userId);
  return { userId, email };
}

function context(user: TestUser, clock: Clock = FIXED) {
  return createServiceContext({
    userId: user.userId,
    email: user.email,
    requestId: randomUUID(),
    clock,
  });
}

async function cleanup(): Promise<void> {
  if (createdUsers.length === 0) return;
  await serviceDb().execute(
    sql`delete from auth.users where id = any(${sql.raw(`array[${createdUsers.map((id) => `'${id}'::uuid`).join(',')}]`)})`,
  );
  createdUsers.length = 0;
}

beforeEach(() => {
  createdUsers.length = 0;
});

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-708] service et API', () => {
  it('CA-1, BR-NOT-04 — six types et les défauts, puis quatre après rechargement', async () => {
    const user = await createUser('defaults');
    const initial = await getNotificationSettings(context(user));
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    expect(initial.value).toMatchObject({
      channels: { app: true, email: true, browser: true },
      types: {
        revision: true,
        validation: true,
        course: true,
        gap: true,
        planning: true,
        relaunch: true,
      },
      digestTime: '08:00',
      quiet: { start: '21:00', end: '08:00', crossesMidnight: true, empty: false },
      weekendQuiet: true,
      maxPerDay: 5,
      activeTypeCount: 6,
    });

    const updated = await updateNotificationSettings(context(user), {
      types: { validation: false, course: false },
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.activeTypeCount).toBe(4);

    // CA-1 — a reload reads the persisted switches and their counter.
    const reloaded = await getNotificationSettings(context(user));
    if (!reloaded.ok) throw reloaded.error;
    expect(reloaded.value.activeTypeCount).toBe(4);
    expect(reloaded.value.types.validation).toBe(false);
    expect(reloaded.value.types.course).toBe(false);
    expect(reloaded.value.types.revision).toBe(true);

    const rows = await serviceDb().execute<{
      validation: boolean;
      course: boolean;
      revision: boolean;
    }>(sql`
      select type_validation as validation, type_course as course, type_revision as revision
        from public.notification_settings where user_id = ${user.userId}::uuid
    `);
    expect(rows[0]).toEqual({ validation: false, course: false, revision: true });
  });

  it('CA-2, ET-3 — un changement de canal ne touche ni l’application ni les abonnements push', async () => {
    const user = await createUser('channels');
    await serviceDb()
      .insert(pushSubscriptions)
      .values({
        userId: user.userId,
        endpoint: `https://push.test.learny/${user.userId}`,
        p256dh: 'p256dh-test',
        auth: 'auth-test',
      });
    const result = await updateNotificationSettings(context(user), {
      channels: { email: false, browser: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.channels).toEqual({ app: true, email: false, browser: false });
    // ET-3 — no push subscription is removed without an explicit request.
    const subscriptions = await serviceDb().execute<{ total: number }>(sql`
      select count(*)::int as total from public.push_subscriptions
       where user_id = ${user.userId}::uuid
    `);
    expect(subscriptions[0]?.total).toBe(1);
    // EF-1 — the application channel stays on, whatever the patch.
    const refused = await updateNotificationSettings(context(user), {
      channels: { app: false },
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe('VALIDATION_FAILED');
    const after = await getNotificationSettings(context(user));
    if (!after.ok) throw after.error;
    expect(after.value.channels.app).toBe(true);
  });

  it('CA-3 — 08:00, 21:00–08:00 et week-end sont persistés et appliqués à un test', async () => {
    const user = await createUser('schedule');
    const saved = await updateNotificationSettings(context(user), {
      digestTime: '09:00',
      quietStart: '22:00',
      quietEnd: '08:00',
      weekendQuiet: true,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value).toMatchObject({
      digestTime: '09:00',
      quiet: { start: '22:00', end: '08:00', crossesMidnight: true, empty: false },
      weekendQuiet: true,
    });

    // The test notification at 22:30 Paris waits for the end of the quiet hours at 08:00 (07:00Z).
    const evening = await previewTestNotification(context(user, clockAt('2026-11-11T21:30:00Z')));
    expect(evening.ok).toBe(true);
    if (!evening.ok) return;
    expect(evening.value.status).toBe('deferred_quiet');
    expect(evening.value.scheduledFor).toBe('2026-11-12T07:00:00.000Z');
    expect(evening.value.digestAt).toBe('2026-11-12T08:00:00.000Z');
    expect(evening.value.timezone).toBe('Europe/Paris');

    // Saturday: the weekend rule holds everything but the revisions due until Monday 08:00.
    const weekend = await previewTestNotification(context(user, clockAt('2026-11-14T12:20:00Z')));
    expect(weekend.ok).toBe(true);
    if (!weekend.ok) return;
    expect(weekend.value.status).toBe('deferred_quiet');
    expect(weekend.value.scheduledFor).toBe('2026-11-16T07:00:00.000Z');

    // A time outside quiet hours is simply sent, in the same profile zone.
    const daytime = await previewTestNotification(context(user));
    expect(daytime.ok).toBe(true);
    if (!daytime.ok) return;
    expect(daytime.value).toMatchObject({ status: 'sent', scheduledFor: null });

    const rows = await serviceDb().execute<{
      digest: string;
      quiet_start: string;
      quiet_end: string;
      weekend: boolean;
    }>(sql`
      select digest_time::text as digest, quiet_start::text as quiet_start,
             quiet_end::text as quiet_end, weekend_quiet as weekend
        from public.notification_settings where user_id = ${user.userId}::uuid
    `);
    expect(rows[0]).toMatchObject({
      digest: '09:00:00',
      quiet_start: '22:00:00',
      quiet_end: '08:00:00',
      weekend: true,
    });
  });

  it('CA-4, CL-1 — une requête invalide ne crée aucune écriture', async () => {
    const user = await createUser('invalid');
    const before = await getNotificationSettings(context(user));
    if (!before.ok) throw before.error;
    for (const body of [
      {},
      { channels: {} },
      { types: {} },
      { quietStart: '25:00' },
      { maxPerDay: 4 },
      { channels: { app: false } },
    ]) {
      const result = await updateNotificationSettings(context(user), body);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION_FAILED');
    }
    const after = await getNotificationSettings(context(user));
    if (!after.ok) throw after.error;
    expect(after.value).toEqual(before.value);
  });

  it('CA-4, CL-2 — une version obsolète renvoie 409 et restitue l’état courant', async () => {
    const user = await createUser('conflict');
    const before = await getNotificationSettings(context(user));
    if (!before.ok) throw before.error;
    const stale = await updateNotificationSettings(context(user), {
      digestTime: '09:00',
      expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe('CONFLICT');
    expect(stale.error.status).toBe(409);
    const current = await getNotificationSettings(context(user));
    if (!current.ok) throw current.error;
    expect(current.value.digestTime).toBe('08:00');
    expect(current.value.updatedAt).toBe(before.value.updatedAt);

    // A replay with the fresh version goes through.
    const replay = await updateNotificationSettings(context(user), {
      digestTime: '09:00',
      expectedUpdatedAt: current.value.updatedAt,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.digestTime).toBe('09:00');
  });

  it('CA-4 — RLS : un second utilisateur garde ses propres réglages', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const changed = await updateNotificationSettings(context(alice), {
      types: { revision: false, relaunch: false },
      channels: { email: false },
      quietStart: '22:00',
    });
    expect(changed.ok).toBe(true);

    const hers = await getNotificationSettings(context(alice));
    if (!hers.ok) throw hers.error;
    expect(hers.value.activeTypeCount).toBe(4);
    expect(hers.value.channels.email).toBe(false);
    expect(hers.value.quiet.start).toBe('22:00');

    const his = await getNotificationSettings(context(bob));
    if (!his.ok) throw his.error;
    expect(his.value.activeTypeCount).toBe(6);
    expect(his.value.channels).toEqual({ app: true, email: true, browser: true });
    expect(his.value.quiet.start).toBe('21:00');
  });

  it('CA-4, CL-1 — un identifiant sans profil répond 404 sans révéler son existence', async () => {
    const orphan = {
      userId: randomUUID(),
      email: `${PREFIX}orphan-${randomUUID().slice(0, 8)}@test.learny.test`,
    };
    const result = await getNotificationSettings(context(orphan));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('CA-3, CL-5 — une plage vide début=fin est conservée et ne reporte rien', async () => {
    const user = await createUser('empty');
    const saved = await updateNotificationSettings(context(user), {
      quietStart: '08:00',
      quietEnd: '08:00',
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.quiet).toEqual({
      start: '08:00',
      end: '08:00',
      crossesMidnight: false,
      empty: true,
    });
    const evening = await previewTestNotification(context(user, clockAt('2026-11-11T21:30:00Z')));
    if (!evening.ok) throw evening.error;
    expect(evening.value).toEqual({
      status: 'sent',
      scheduledFor: null,
      digestAt: '2026-11-12T07:00:00.000Z',
      timezone: 'Europe/Paris',
    });
  });
});
