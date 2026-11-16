// Integration tests of the global quiz projection (SPEC-717 §12, CA-1 to CA-3, ET-5).
// Real Postgres: the applied action of the sixth automation imposes the `recall_card` format and
// its reason on the daily session (ADR-0193 §4); a pending or consumed action imposes nothing.
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import {
  createAutomationActionQuiet,
  createServiceContext,
  getOrCreateTodaySession,
} from '@learny/services';
import { createBrick, createNotionState } from '@learny/testing';

const PREFIX = 'sdd-717-int-';
const NOW = '2026-11-11T12:20:00.000Z';

const clock = { now: () => new Date(NOW) };

interface Fixture {
  userId: string;
  email: string;
  formationId: string;
  moduleId: string;
  courseId: string;
  notionId: string;
  brickId: string;
}

function context(fixture: Fixture) {
  return createServiceContext({
    userId: fixture.userId,
    email: fixture.email,
    requestId: randomUUID(),
    clock,
    logger: createLogger({ level: 'error' }),
  });
}

async function seed(label: string): Promise<Fixture> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email, firstName: 'Alex', timezone: 'Europe/Paris' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0] ?? '';
    const notionId = programme.notionIds[0] ?? '';
    const course = await createTestCourse(tx, { ownerId: user.id, moduleId });
    await tx.execute(sql`
      update public.modules set status = 'validated', threshold = 80 where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status, validated_at)
      values (${user.id}::uuid, ${moduleId}::uuid, 'validated', '2026-10-20T08:00:00Z'::timestamptz)
      on conflict (user_id, module_id) do update set status = 'validated'
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', onboarding_completed_at = '2026-09-01T08:00:00Z'::timestamptz,
          timezone = 'Europe/Paris', current_formation_id = ${programme.formationId}::uuid
      where id = ${user.id}::uuid
    `);
    await tx.execute(sql`
      insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
      values (${user.id}::uuid, 2, '{1,2,3,4,5,6,7}'::smallint[], '{soir}'::study_slot[])
      on conflict (user_id) do update set study_days = '{1,2,3,4,5,6,7}'::smallint[]
    `);
    const brick = await createBrick(tx, {
      ownerId: user.id,
      formationId: programme.formationId,
      type: 'recall_card',
      purpose: 'review',
      notionIds: [notionId],
      payload: {
        front: 'Que signifie la partie double ?',
        back: 'Chaque opération est enregistrée au débit d’un compte et au crédit d’un autre.',
        sourceLabel: 'Votre question au tuteur',
        sources: [],
      },
    });
    await createNotionState(tx, {
      userId: user.id,
      notionId,
      dueAt: new Date('2026-11-11T08:00:00Z'),
      inReview: true,
      mastery: 40,
    });
    return {
      userId: user.id,
      email: user.email,
      formationId: programme.formationId,
      moduleId,
      courseId: course.courseId,
      notionId,
      brickId: brick.id,
    };
  });
}

async function addAction(
  fixture: Fixture,
  input: { status: 'applied' | 'pending_consent' | 'consumed'; brickId: string | null },
): Promise<string> {
  return serviceDb().transaction(async (tx) => {
    const created = await createAutomationActionQuiet(tx, {
      userId: fixture.userId,
      formationId: fixture.formationId,
      automation: 'questions_cartes',
      kind: 'card_created',
      summary: 'Carte de rappel « Notion » ajoutée au quiz global.',
      payload: {
        dedupeKey: `question_card:${randomUUID()}:${fixture.notionId}`,
        notionId: fixture.notionId,
        notionLabel: 'Notion',
        brickId: input.brickId,
        mode: 'auto',
      },
      requiresConsent: input.status === 'pending_consent',
      createdAt: new Date(NOW),
    });
    if (created.action === null) throw new Error('action non créée');
    if (input.status === 'consumed') {
      await tx.execute(sql`
        update public.automation_actions set status = 'consumed'
        where id = ${created.action.id}::uuid
      `);
    }
    return created.action.id;
  });
}

async function itemFor(fixture: Fixture) {
  const result = await getOrCreateTodaySession(context(fixture), fixture.formationId, 'full');
  if (!result.ok) throw result.error;
  return result.value.items.find((item) => item.notionIds.includes(fixture.notionId)) ?? null;
}

describe('[SPEC-717] service et API — tirage du quiz global', () => {
  it('CA-2 — une carte appliquée entre au prochain quiz avec la raison « Votre question »', async () => {
    const fixture = await seed('applied');
    await addAction(fixture, { status: 'applied', brickId: fixture.brickId });
    const item = await itemFor(fixture);
    expect(item).not.toBeNull();
    expect(item?.type).toBe('recall_card');
    expect(item?.reason).toEqual({ code: 'question_card', label: 'Votre question' });
  });

  it('CA-1, ET-5 — une proposition en attente ne force pas le tirage avant acceptation', async () => {
    const fixture = await seed('pending');
    await addAction(fixture, { status: 'pending_consent', brickId: null });
    const item = await itemFor(fixture);
    expect(item).not.toBeNull();
    expect(item?.reason).toBeNull();
  });

  it('ET-5 — une carte consommée ne force plus le format', async () => {
    const fixture = await seed('consumed');
    await addAction(fixture, { status: 'consumed', brickId: fixture.brickId });
    const item = await itemFor(fixture);
    expect(item).not.toBeNull();
    expect(item?.reason).toBeNull();
  });
});

afterAll(async () => {
  await closeDb();
});
