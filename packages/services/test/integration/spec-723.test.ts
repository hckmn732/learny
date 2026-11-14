// Integration tests of the streak, regularity and milestone interface (SPEC-723 §12, CA-1 to
// CA-3). Real Postgres with RLS, the real `daily_activity` and `milestones` tables, the frozen
// clock of ADR-0047 and the mocked notifications of SPEC-209. Users are created by factory with
// the `sdd-723-` prefix and deleted in afterEach, cascade included.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';
import { createFixedClock } from '@learny/testing';

import { createServiceContext } from '../../src/context';
import type { ServiceContext } from '../../src/context';
import { getMilestones, getStreak } from '../../src/serie-regularite-et-jalons-interface';

const PREFIX = 'sdd-723-';
const NOW = new Date('2026-11-11T12:20:00Z');
const FIXED = createFixedClock();
const SEED_DAYS = [
  '2026-10-31',
  '2026-11-01',
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
];

interface TestUser {
  userId: string;
  email: string;
}

const createdUsers: string[] = [];

async function createUser(label: string): Promise<TestUser> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const userId = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email });
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', timezone = 'Europe/Paris'
      where id = ${user.id}::uuid
    `);
    return user.id;
  });
  createdUsers.push(userId);
  return { userId, email };
}

function context(user: TestUser): ServiceContext {
  return createServiceContext({
    userId: user.userId,
    email: user.email,
    requestId: randomUUID(),
    clock: FIXED,
  });
}

async function cleanup(): Promise<void> {
  if (createdUsers.length === 0) return;
  await serviceDb().execute(
    sql`delete from auth.users where id = any(${sql.raw(`array[${createdUsers.map((id) => `'${id}'::uuid`).join(',')}]`)})`,
  );
  createdUsers.length = 0;
}

interface Seed {
  formationId: string;
  moduleIds: string[];
  notionIds: string[];
}

/** The 12 studied days of SPEC-115 plus a hundred notions at 90 % mastery. */
async function seed(
  userId: string,
  options: { notions?: number; validatedModules?: number } = {},
): Promise<Seed> {
  const notionCount = options.notions ?? 100;
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 5,
      chaptersPerModule: 5,
      notionsPerChapter: Math.max(1, Math.ceil(notionCount / 25)),
      title: 'SAP S/4HANA Finance',
    });
    await tx.execute(sql`
      update public.profiles
      set current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
      values ${sql.join(
        SEED_DAYS.map(
          (day) => sql`(${userId}::uuid, ${day}::date, 60, true, array['e2e']::text[])`,
        ),
        sql`, `,
      )}
      on conflict (user_id, day) do nothing
    `);

    for (const [index, moduleId] of programme.moduleIds.entries()) {
      if (index >= (options.validatedModules ?? 0)) continue;
      await tx.execute(sql`
        insert into public.module_progress (
          user_id, module_id, status, opened_at, validated_at, best_score
        ) values (
          ${userId}::uuid, ${moduleId}::uuid, 'validated'::public.module_status,
          ${NOW.toISOString()}::timestamptz, ${NOW.toISOString()}::timestamptz, 90
        )
        on conflict (user_id, module_id) do update set
          status = 'validated'::public.module_status,
          validated_at = excluded.validated_at,
          best_score = excluded.best_score
      `);
    }

    for (const notionId of programme.notionIds.slice(0, notionCount)) {
      await createNotionState(tx, {
        userId,
        notionId,
        mastery: 90,
        inReview: true,
        dueAt: NOW,
      });
    }
    return {
      formationId: programme.formationId,
      moduleIds: programme.moduleIds,
      notionIds: programme.notionIds,
    };
  });
}

async function notificationCount(userId: string, type = 'milestone'): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count
    from public.notifications
    where user_id = ${userId}::uuid and type = ${type}::public.notification_type
  `);
  return rows[0]?.count ?? 0;
}

async function milestoneCount(userId: string): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.milestones where user_id = ${userId}::uuid
  `);
  return rows[0]?.count ?? 0;
}

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-723] service et API', () => {
  it('CA-1, ET-3 — le seed du 11 novembre rend 12 jours et 14 cases locales', async () => {
    const user = await createUser('streak');
    await seed(user.userId, { notions: 0 });

    const result = await getStreak(context(user));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.days).toBe(12);
    expect(result.value.timezone).toBe('Europe/Paris');
    expect(result.value.computedOn).toBe('2026-11-11');
    expect(result.value.regularity).toHaveLength(14);
    expect(result.value.regularity[0]).toEqual({ date: '2026-10-29', status: 'none' });
    expect(result.value.regularity.at(-1)).toEqual({ date: '2026-11-11', status: 'done' });
    expect(result.value.regularity.filter((day) => day.status === 'done')).toHaveLength(12);
    expect(result.value.nextMilestone).toMatchObject({ kind: 'streak_30', remaining: 18 });
  });

  it('CA-2, CL-5 — 100 notions à 90 % : un jalon et une seule notification, même en concurrence', async () => {
    const user = await createUser('notions');
    await seed(user.userId);

    const first = await getMilestones(context(user));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.items).toHaveLength(1);
    expect(first.value.items[0]).toMatchObject({
      key: 'notions_100',
      kind: 'notions_100',
      label: '100 notions retenues',
      achievedOn: '2026-11-11',
    });
    expect(first.value.nextMilestone).toMatchObject({ kind: 'streak_30', remaining: 18 });
    expect(JSON.stringify(first.value)).not.toMatch(/classement|leaderboard|rang/i);
    expect(await milestoneCount(user.userId)).toBe(1);
    expect(await notificationCount(user.userId)).toBe(1);

    // CL-5 — two identical reads at once do not duplicate the row or the notification.
    const [left, right] = await Promise.all([
      getMilestones(context(user)),
      getMilestones(context(user)),
    ]);
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(left.value.items).toHaveLength(1);
    expect(right.value.items).toHaveLength(1);
    expect(await milestoneCount(user.userId)).toBe(1);
    expect(await notificationCount(user.userId)).toBe(1);
  });

  it('CA-2 — un module validé crée son jalon une seule fois, sans récompense de vitesse', async () => {
    const user = await createUser('module');
    await seed(user.userId, { notions: 0, validatedModules: 1 });

    const first = await getMilestones(context(user));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const module = first.value.items.find((item) => item.kind === 'module_validated');
    expect(module).toMatchObject({
      kind: 'module_validated',
      formationTitle: 'SAP S/4HANA Finance',
    });
    expect(module?.label).toMatch(/^Module « .+ » validé$/);
    expect(JSON.stringify(first.value)).not.toMatch(/classement|premier|plus vite/i);

    const second = await getMilestones(context(user));
    if (!second.ok) throw second.error;
    expect(second.value.items.filter((item) => item.kind === 'module_validated')).toHaveLength(1);
    expect(await milestoneCount(user.userId)).toBe(1);
  });

  it('CA-3 — un autre apprenant reçoit 404 et ne lit aucun jalon du premier', async () => {
    const owner = await createUser('owner');
    const other = await createUser('other');
    const seeded = await seed(owner.userId);
    const ownerResult = await getMilestones(context(owner));
    if (!ownerResult.ok) throw ownerResult.error;
    expect(ownerResult.value.items.length).toBeGreaterThan(0);

    const foreign = await getMilestones(context(other), { formationId: seeded.formationId });
    expect(foreign).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const own = await getMilestones(context(other));
    if (!own.ok) throw own.error;
    expect(own.value.items).toHaveLength(0);
    expect(JSON.stringify(own.value)).not.toContain(seeded.formationId);
  });

  it('CL-3 — une pause au milieu de la période reste neutre et ne coupe pas la série', async () => {
    const user = await createUser('pause');
    const seeded = await seed(user.userId, { notions: 0 });
    await serviceDb().execute(sql`
      delete from public.daily_activity
      where user_id = ${user.userId}::uuid and day = '2026-11-04'::date
    `);
    await serviceDb().execute(sql`
      insert into public.pauses (user_id, starts_on, ends_on)
      values (${user.userId}::uuid, '2026-11-04'::date, '2026-11-04'::date)
    `);
    expect(seeded.formationId).toBeTruthy();

    const result = await getStreak(context(user));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.regularity.find((day) => day.date === '2026-11-04')?.status).toBe(
      'neutral',
    );
    expect(result.value.days).toBe(11);
  });

  it('CL-4 — un changement de fuseau recalcule les 14 dates à la prochaine lecture', async () => {
    const user = await createUser('timezone');
    await seed(user.userId, { notions: 0 });
    await serviceDb().execute(sql`
      update public.profiles set timezone = 'Pacific/Auckland' where id = ${user.userId}::uuid
    `);
    const result = await getStreak(context(user));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.timezone).toBe('Pacific/Auckland');
    expect(result.value.computedOn).toBe('2026-11-12');
    expect(result.value.regularity.at(-1)?.date).toBe('2026-11-12');
    expect(result.value.regularity).toHaveLength(14);
  });
});
