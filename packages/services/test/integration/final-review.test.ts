// Integration tests of the final review and memory interview (SPEC-617 §12, CA-1 to CA-4).
//
// Postgres is real: the completion event is replayed through the SPEC-612 unlock service, the
// same userId never reads another learner's formation, retention stays null when nothing was
// reviewed, a light interview draws a five-minute session and a stopped one cancels future
// reminders while keeping the whole history. The clock is frozen at the reference instant.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { createNotionState, makeModuleWithBank } from '@learny/testing';

import { createServiceContext } from '../../src/context';
import type { ServiceContext } from '../../src/context';
import { getFinalReview } from '../../src/formations/get-final-review';
import { setMaintenance } from '../../src/formations/set-maintenance';
import { unlockModule } from '../../src/quiz/module-unlock';
import { buildMaintenanceSession } from '../../src/review/build-session';

const PREFIX = 'sdd-617-';
const NOW = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(NOW);
  }
}

interface Seed {
  userId: string;
  formationId: string;
  moduleIds: string[];
  notionIds: string[];
}

interface SeedOptions {
  validatedModules?: number;
  status?: 'active' | 'completed';
  withBank?: boolean;
  withReminders?: boolean;
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

async function createUser(label: string): Promise<string> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => (await createTestUser(tx, { email })).id);
}

function context(userId: string): ServiceContext {
  return createServiceContext({
    userId,
    requestId: `req-617-${randomUUID()}`,
    clock: new TestClock(),
  });
}

async function seedReview(userId: string, options: SeedOptions = {}): Promise<Seed> {
  const validatedModules = options.validatedModules ?? 7;
  const status = options.status ?? (validatedModules === 7 ? 'completed' : 'active');
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 7,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: 'SAP S/4HANA Finance',
    });
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done',
          timezone = 'Europe/Paris',
          current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      update public.formations
      set title = 'SAP S/4HANA Finance',
          monogram = 'SAP',
          accent_color = 'indigo',
          status = ${status}::public.formation_status,
          start_date = '2026-10-01',
          end_date = '2026-11-11',
          volume_hours = 60,
          completed_at = ${
            status === 'completed' ? sql`${NOW.toISOString()}::timestamptz` : sql`null`
          },
          maintenance_mode = null
      where id = ${programme.formationId}::uuid
    `);
    for (const [index, moduleId] of programme.moduleIds.entries()) {
      const validated = index < validatedModules;
      const moduleStatus = validated ? 'validated' : index === validatedModules ? 'open' : 'locked';
      await tx.execute(sql`
        update public.modules
        set title = ${`Module ${String(index + 1)}`},
            status = ${moduleStatus}::public.module_status,
            threshold = 80,
            validated_at = ${validated ? sql`${NOW.toISOString()}::timestamptz` : sql`null`}
        where id = ${moduleId}::uuid
      `);
      if (validated) {
        await tx.execute(sql`
          insert into public.module_progress (
            user_id, module_id, status, opened_at, validated_at, best_score
          ) values (
            ${userId}::uuid, ${moduleId}::uuid, 'validated'::public.module_status,
            ${NOW.toISOString()}::timestamptz, ${NOW.toISOString()}::timestamptz, 88
          )
          on conflict (user_id, module_id) do update set
            status = 'validated'::public.module_status,
            validated_at = excluded.validated_at,
            best_score = excluded.best_score
        `);
      } else {
        await tx.execute(sql`
          insert into public.module_progress (user_id, module_id, status, opened_at)
          values (
            ${userId}::uuid, ${moduleId}::uuid, ${moduleStatus}::public.module_status,
            ${NOW.toISOString()}::timestamptz
          )
          on conflict (user_id, module_id) do update set status = excluded.status
        `);
      }
    }

    const gaps: Record<number, { nature: 'confusion' | 'forgetting'; mastery: number }> = {
      11: { nature: 'confusion', mastery: 30 },
      12: { nature: 'forgetting', mastery: 55 },
    };
    for (const [index, notionId] of programme.notionIds.entries()) {
      const gap = gaps[index];
      await createNotionState(tx, {
        userId,
        notionId,
        mastery: gap?.mastery ?? 90,
        inReview: true,
        dueAt: NOW,
        ...(gap === undefined
          ? {}
          : { gapNature: gap.nature, evidence: `Preuve de la notion ${String(index + 1)}.` }),
      });
    }

    // Three realised slots total 135 minutes, one future slot and one cancelled slot.
    await tx.execute(sql`
      insert into public.schedule_slots (
        user_id, formation_id, kind, title, starts_at, ends_at, status, created_by
      ) values
        (
          ${userId}::uuid, ${programme.formationId}::uuid, 'course'::public.slot_kind,
          'Cours réalisé', '2026-11-09T09:00:00Z'::timestamptz,
          '2026-11-09T10:00:00Z'::timestamptz, 'done'::public.slot_status, 'learner'::public.slot_creator
        ),
        (
          ${userId}::uuid, ${programme.formationId}::uuid, 'revision'::public.slot_kind,
          'Révision réalisée', '2026-11-10T09:00:00Z'::timestamptz,
          '2026-11-10T09:30:00Z'::timestamptz, 'done'::public.slot_status, 'learner'::public.slot_creator
        ),
        (
          ${userId}::uuid, ${programme.formationId}::uuid, 'exercise'::public.slot_kind,
          'Exercice réalisé', '2026-11-10T14:00:00Z'::timestamptz,
          '2026-11-10T14:45:00Z'::timestamptz, 'done'::public.slot_status, 'learner'::public.slot_creator
        ),
        (
          ${userId}::uuid, ${programme.formationId}::uuid, 'global_quiz'::public.slot_kind,
          'Quiz global futur', '2026-11-12T17:00:00Z'::timestamptz,
          '2026-11-12T17:10:00Z'::timestamptz, 'planned'::public.slot_status, 'planner'::public.slot_creator
        ),
        (
          ${userId}::uuid, ${programme.formationId}::uuid, 'revision'::public.slot_kind,
          'Révision annulée', '2026-11-08T09:00:00Z'::timestamptz,
          '2026-11-08T09:30:00Z'::timestamptz, 'cancelled'::public.slot_status, 'planner'::public.slot_creator
        )
    `);

    await tx.execute(sql`
      insert into public.programme_proposals (
        formation_id, user_id, version, source, description, payload
      ) values (
        ${programme.formationId}::uuid, ${userId}::uuid, 2, 'generated'::public.programme_source,
        'Programme ajusté', '{}'::jsonb
      )
    `);

    if (options.withReminders === true) {
      const notification = await tx.execute<{ id: string }>(sql`
        insert into public.notifications (
          user_id, formation_id, type, title, body, href, icon, dedupe_key
        ) values (
          ${userId}::uuid, ${programme.formationId}::uuid,
          'global_quiz_today'::public.notification_type,
          'Quiz global du jour', '14 notions à revoir.', '/formations/x/quiz-global',
          'quiz', ${`sdd-617-reminder-${randomUUID()}`}
        )
        returning id::text as id
      `);
      const notificationId = notification[0]?.id ?? '';
      await tx.execute(sql`
        insert into public.notification_deliveries (notification_id, channel, status, scheduled_for)
        values (
          ${notificationId}::uuid, 'email'::public.delivery_channel,
          'scheduled'::public.delivery_status, '2026-11-12T08:00:00Z'::timestamptz
        )
      `);
    }

    if (options.withBank === true) {
      for (const moduleId of programme.moduleIds) {
        await makeModuleWithBank(tx, {
          userId,
          formationId: programme.formationId,
          moduleId,
          notions: 2,
          variantsPerFormat: 1,
        });
      }
    }

    return {
      userId,
      formationId: programme.formationId,
      moduleIds: programme.moduleIds,
      notionIds: programme.notionIds,
    };
  });
}

async function outboxCount(name: string, formationId: string): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count
    from public.event_outbox
    where name = ${name}
      and data->>'formationId' = ${formationId}
  `);
  return rows[0]?.count ?? 0;
}

describe('[SPEC-617] bilan final et entretien de mémoire', () => {
  it('CA-1, CA-3 : un bilan 7/7 agrège acquis, fragiles, heures réalisées et rétention absente', async () => {
    const userId = await createUser('bilan');
    const seed = await seedReview(userId);
    const result = await getFinalReview(context(userId), seed.formationId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('bilan attendu');
    expect(result.value).toMatchObject({
      formationId: seed.formationId,
      formationTitle: 'SAP S/4HANA Finance',
      status: 'completed',
      programVersion: 2,
      completedOn: '2026-11-11',
      weeks: 6,
      stats: {
        masteredNotions: 12,
        fragileNotions: 2,
        totalNotions: 14,
        completedMinutes: 135,
        resultPercent: 88,
      },
      retention: { oneMonth: null, twoMonths: null },
      maintenance: { mode: null, dailyMinutes: 5, dueOnly: true, reminders: false },
    });
    expect(result.value.gaps.map((gap) => [gap.label, gap.mastery])).toEqual([
      ['Notion 6.1.2', 30],
      ['Notion 7.1.1', 55],
    ]);
    expect(result.value.gaps[0]?.natureLabel).toBe('Confusion');
    expect(result.value.modules).toHaveLength(7);
    expect(result.value.mapHref).toBe(`/formations/${seed.formationId}/carte`);

    const again = await getFinalReview(context(userId), seed.formationId);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.gaps).toEqual(result.value.gaps);
  });

  it('CA-1 : une formation à 6 modules validés sur 7 ne peut pas ouvrir le bilan', async () => {
    const userId = await createUser('six');
    const seed = await seedReview(userId, { validatedModules: 6, status: 'active' });
    const result = await getFinalReview(context(userId), seed.formationId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('CA-4 : un second utilisateur reçoit 404 et un identifiant invalide 400', async () => {
    const owner = await createUser('owner');
    const other = await createUser('other');
    const seed = await seedReview(owner);
    const foreign = await getFinalReview(context(other), seed.formationId);
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe('NOT_FOUND');

    const malformed = await getFinalReview(context(owner), 'pas-un-uuid');
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.error.code).toBe('VALIDATION_FAILED');
  });

  it('CA-2, CA-4 : light limite à 5 min, stopped annule les rappels et conserve l’historique', async () => {
    const userId = await createUser('modes');
    const seed = await seedReview(userId, { withBank: true, withReminders: true });
    const light = await setMaintenance(context(userId), seed.formationId, { mode: 'light' });
    expect(light.ok).toBe(true);
    if (!light.ok) throw new Error('mode light attendu');
    expect(light.value.maintenance).toEqual({
      mode: 'light',
      dailyMinutes: 5,
      dueOnly: true,
      reminders: true,
    });
    expect(light.value.dueCount).toBe(14);

    const session = await buildMaintenanceSession(context(userId), seed.formationId);
    expect(session.ok).toBe(true);
    if (!session.ok) throw new Error('session light attendue');
    expect(session.value.mode).toBe('maintenance');
    expect(session.value.capMinutes).toBe(5);
    expect(session.value.estimatedMinutes).toBeLessThanOrEqual(5);
    expect(session.value.notionCount).toBeLessThanOrEqual(session.value.dueCount);
    expect(session.value.items.length).toBeGreaterThan(0);

    const same = await setMaintenance(context(userId), seed.formationId, { mode: 'light' });
    expect(same.ok).toBe(true);
    expect(await outboxCount('formation/maintenance-changed', seed.formationId)).toBe(1);

    const stopped = await setMaintenance(context(userId), seed.formationId, { mode: 'stopped' });
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) throw new Error('mode stopped attendu');
    expect(stopped.value.maintenance).toMatchObject({ mode: 'stopped', reminders: false });
    expect(stopped.value.dueCount).toBe(0);

    const formation = await serviceDb().execute<{
      maintenance_mode: string;
      completed_at: Date | string;
    }>(sql`
      select maintenance_mode::text as maintenance_mode, completed_at
      from public.formations where id = ${seed.formationId}::uuid
    `);
    expect(formation[0]?.maintenance_mode).toBe('stopped');
    expect(formation[0]?.completed_at).toBeTruthy();

    const slots = await serviceDb().execute<{ status: string; count: number }>(sql`
      select status::text as status, count(*)::int as count
      from public.schedule_slots
      where formation_id = ${seed.formationId}::uuid
      group by status
      order by status
    `);
    expect(slots).toEqual([
      { status: 'cancelled', count: 2 },
      { status: 'done', count: 3 },
    ]);

    const deliveries = await serviceDb().execute<{ status: string; error: string | null }>(sql`
      select d.status::text as status, d.error
      from public.notification_deliveries d
      join public.notifications n on n.id = d.notification_id
      where n.formation_id = ${seed.formationId}::uuid
    `);
    expect(deliveries).toEqual([{ status: 'skipped_pref', error: 'maintenance_stopped' }]);

    const history = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count
      from public.notion_states
      where user_id = ${userId}::uuid
    `);
    expect(history[0]?.count).toBe(14);

    const stoppedSession = await buildMaintenanceSession(context(userId), seed.formationId);
    expect(stoppedSession.ok).toBe(false);
    if (!stoppedSession.ok) expect(stoppedSession.error.code).toBe('NOT_FOUND');

    const resumed = await setMaintenance(context(userId), seed.formationId, { mode: 'light' });
    expect(resumed.ok).toBe(true);
    if (resumed.ok) {
      expect(resumed.value.maintenance.mode).toBe('light');
      expect(resumed.value.dueCount).toBe(14);
    }
  });

  it('CA-1, CA-4 : une fin rejouée ne crée qu’une fin et un seul bilan', async () => {
    const userId = await createUser('replay');
    const seed = await seedReview(userId, { validatedModules: 6, status: 'active' });
    const lastModule = seed.moduleIds[6];
    if (lastModule === undefined) throw new Error('dernier module absent');
    const input = {
      userId,
      formationId: seed.formationId,
      moduleId: lastModule,
      attemptId: randomUUID(),
      score: 92,
      passed: true,
    };
    const first = await unlockModule(context(userId), input);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.formationCompleted).toBe(true);
    const second = await unlockModule(context(userId), input);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.formationCompleted).toBe(false);
      expect(second.value.revisionOnly).toBe(true);
    }
    expect(await outboxCount('formation/completed', seed.formationId)).toBe(1);

    const formation = await serviceDb().execute<{
      status: string;
      completed_at: Date | string;
    }>(sql`
      select status::text as status, completed_at
      from public.formations where id = ${seed.formationId}::uuid
    `);
    expect(formation[0]?.status).toBe('completed');
    const completedAt = new Date(formation[0]?.completed_at ?? 0).toISOString();
    expect(completedAt).toBe(NOW.toISOString());

    const review = await getFinalReview(context(userId), seed.formationId);
    expect(review.ok).toBe(true);
    if (review.ok) {
      expect(review.value.stats.masteredNotions).toBe(12);
      expect(review.value.gaps).toHaveLength(2);
      expect(review.value.completedAt).toBe(NOW.toISOString());
    }
  });

  it('CA-4 : un mode invalide ou une version périmée ne crée aucune écriture', async () => {
    const userId = await createUser('invalid');
    const seed = await seedReview(userId);
    const invalid = await setMaintenance(context(userId), seed.formationId, {
      mode: 'bogus' as never,
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe('VALIDATION_FAILED');

    const stale = await setMaintenance(context(userId), seed.formationId, {
      mode: 'light',
      expectedUpdatedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('CONFLICT');
    expect(await outboxCount('formation/maintenance-changed', seed.formationId)).toBe(0);

    const formation = await serviceDb().execute<{ maintenance_mode: string | null }>(sql`
      select maintenance_mode::text as maintenance_mode
      from public.formations where id = ${seed.formationId}::uuid
    `);
    expect(formation[0]?.maintenance_mode).toBeNull();
  });
});
