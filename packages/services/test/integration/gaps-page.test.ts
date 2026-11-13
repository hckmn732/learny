// Integration tests of the « Mes lacunes » read model (SPEC-615 §12, CA-1 to CA-4).
//
// Postgres is real: RLS hides another learner's formation, the counters and the filtered cards are
// read from the same committed snapshot, the gap evidence comes from `gap_events`, and a deleted
// course section removes the course link instead of leaving a broken anchor.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { AppError, type Clock } from '@learny/core';
import { serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';

import { createServiceContext } from '../../src/context';
import { listGaps } from '../../src/gaps';

const PREFIX = 'sdd-615-';
const NOW = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(NOW);
  }
}

interface Seed {
  userId: string;
  formationId: string;
  notionIds: string[];
  moduleIds: string[];
  chapterIds: string[];
  sectionIds: string[];
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

async function seedGaps(userId: string): Promise<Seed> {
  return serviceDb().transaction(async (tx) => {
    await tx.execute(sql`
      update public.profiles set timezone = 'Europe/Paris' where id = ${userId}::uuid
    `);
    const programme = await createTestProgramme(tx, userId, {
      modules: 3,
      chaptersPerModule: 1,
      notionsPerChapter: 3,
      title: 'SAP S/4HANA Finance',
    });
    const sectionIds: string[] = [];
    for (const moduleId of programme.moduleIds) {
      const course = await createTestCourse(tx, { ownerId: userId, moduleId });
      sectionIds.push(...course.sectionIds);
    }
    const [first] = sectionIds;
    const [, second, third, fourth] = sectionIds;
    if (
      first === undefined ||
      second === undefined ||
      third === undefined ||
      fourth === undefined
    ) {
      throw new Error('sections de cours absentes');
    }
    const notion = (index: number): string => {
      const value = programme.notionIds[index];
      if (value === undefined) throw new Error(`notion ${String(index)} absente`);
      return value;
    };

    const gaps: {
      index: number;
      nature: 'confusion' | 'misunderstanding' | 'application' | 'forgetting';
      mastery: number;
      evidence: string;
      section: string;
      anchor: string;
      due: string;
    }[] = [
      {
        index: 0,
        nature: 'confusion',
        mastery: 35,
        evidence: 'confondue avec le type de pièce dans 2 réponses, aux tentatives 1 et 2.',
        section: first,
        anchor: 'cle-de-comptabilisation',
        due: '2026-11-11T16:00:00Z',
      },
      {
        index: 1,
        nature: 'misunderstanding',
        mastery: 28,
        evidence: 'erreurs répétées et réponses ouvertes à côté du sujet.',
        section: second,
        anchor: 'ledgers-paralleles',
        due: '2026-11-11T16:00:00Z',
      },
      {
        index: 2,
        nature: 'application',
        mastery: 55,
        evidence: 'définition juste, mais exercice de saisie échoué.',
        section: third,
        anchor: 'equilibre-d-une-piece',
        due: '2026-11-11T16:00:00Z',
      },
      {
        index: 3,
        nature: 'forgetting',
        mastery: 60,
        evidence: 'réussie le 6 nov., ratée au quiz global du 10 nov.',
        section: fourth,
        anchor: 'variante-d-exercice',
        due: '2026-11-11T16:00:00Z',
      },
    ];
    for (const gap of gaps) {
      const notionId = notion(gap.index);
      await createNotionState(tx, {
        userId,
        notionId,
        gapNature: gap.nature,
        mastery: gap.mastery,
        evidence: gap.evidence,
        inReview: true,
        dueAt: new Date(gap.due),
      });
      await tx.execute(sql`
        update public.course_sections
        set anchor = ${gap.anchor}, notion_ids = array[${notionId}]::uuid[]
        where id = ${gap.section}::uuid
      `);
      await tx.execute(sql`
        insert into public.gap_events (user_id, notion_id, kind, nature, evidence)
        values (
          ${userId}::uuid,
          ${notionId}::uuid,
          'detected',
          ${gap.nature}::public.gap_nature,
          ${JSON.stringify({ summary: gap.evidence })}::jsonb
        )
      `);
    }

    // Two mastered notions and a cleared gap never appear in the cards or in the counters.
    for (const [index, mastery] of [
      [4, 92],
      [5, 84],
    ] as const) {
      await createNotionState(tx, {
        userId,
        notionId: notion(index),
        mastery,
        inReview: true,
        dueAt: new Date('2026-11-11T16:00:00Z'),
      });
    }
    const cleared = notion(6);
    await createNotionState(tx, {
      userId,
      notionId: cleared,
      gapNature: 'confusion',
      mastery: 81,
      evidence: 'ancienne lacune',
      inReview: false,
    });
    await tx.execute(sql`
      update public.notion_states
      set gap_cleared_at = ${NOW.toISOString()}::timestamptz
      where user_id = ${userId}::uuid and notion_id = ${cleared}::uuid
    `);

    return {
      userId,
      formationId: programme.formationId,
      notionIds: programme.notionIds,
      moduleIds: programme.moduleIds,
      chapterIds: programme.chapterIds,
      sectionIds,
    };
  });
}

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) throw new Error(`élément ${String(index)} absent`);
  return value;
}

function context(userId: string) {
  return createServiceContext({ userId, requestId: randomUUID(), clock: new TestClock() });
}

async function writeCounts(userId: string): Promise<{ states: number; events: number }> {
  const rows = await serviceDb().execute<{ states: number; events: number }>(sql`
    select
      (select count(*)::int from public.notion_states where user_id = ${userId}::uuid) as states,
      (select count(*)::int from public.gap_events where user_id = ${userId}::uuid) as events
  `);
  return rows[0] ?? { states: 0, events: 0 };
}

describe('[SPEC-615] Mes lacunes', () => {
  it('renvoie les statistiques, les compteurs et les cartes de la formation (EF-1, EF-2)', async () => {
    const userId = await createUser('owner');
    const seed = await seedGaps(userId);
    const result = await listGaps(context(userId), { formationId: seed.formationId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.value;

    expect(data.formationTitle).toBe('SAP S/4HANA Finance');
    expect(data.nature).toBeNull();
    expect(data.summary).toEqual({
      openGaps: 4,
      masteredNotions: 2,
      gapModules: [1, 2, 3],
      masteredModules: [1, 3],
    });
    expect(data.countsByNature).toEqual({
      forgetting: 1,
      confusion: 1,
      misunderstanding: 1,
      application: 1,
    });
    expect(data.items.map((item) => item.nature)).toEqual([
      'confusion',
      'misunderstanding',
      'application',
      'forgetting',
    ]);
    expect(data.nextReviewAt).toBe('2026-11-11T16:00:00.000Z');
    expect(data.timezone).toBe('Europe/Paris');
    expect(data.generatedAt).toBe(NOW.toISOString());

    const confusion = data.items[0];
    expect(confusion?.mastery).toBe(35);
    expect(confusion?.threshold).toBe(80);
    expect(confusion?.revealedBy).toBe(
      'confondue avec le type de pièce dans 2 réponses, aux tentatives 1 et 2.',
    );
    expect(confusion?.recommendedAction).toBe('confrontation');
    expect(confusion?.training).toEqual({
      kind: 'quiz',
      href: `/formations/${seed.formationId}/quiz-global?cible=${at(seed.notionIds, 0)}`,
    });
    expect(confusion?.course).toEqual({
      sectionId: at(seed.sectionIds, 0),
      anchor: 'cle-de-comptabilisation',
      href: `/formations/${seed.formationId}/modules/${at(seed.moduleIds, 0)}/cours?chapitre=${at(seed.chapterIds, 0)}#cle-de-comptabilisation`,
    });
    expect(data.items[2]?.training.kind).toBe('exercise');
  });

  it('filtre une nature sans changer les compteurs ni les données persistées (EF-2, CA-2)', async () => {
    const userId = await createUser('filter');
    const seed = await seedGaps(userId);
    const before = await writeCounts(userId);

    const filtered = await listGaps(context(userId), {
      formationId: seed.formationId,
      nature: 'confusion',
    });
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    expect(filtered.value.nature).toBe('confusion');
    expect(filtered.value.items).toHaveLength(1);
    expect(filtered.value.items[0]?.notionLabel).toContain('Notion 1.1.1');
    expect(filtered.value.countsByNature).toEqual({
      forgetting: 1,
      confusion: 1,
      misunderstanding: 1,
      application: 1,
    });
    expect(filtered.value.summary.openGaps).toBe(4);
    expect(await writeCounts(userId)).toEqual(before);

    const repeated = await listGaps(context(userId), {
      formationId: seed.formationId,
      nature: 'confusion',
    });
    expect(repeated.ok).toBe(true);
    expect(await writeCounts(userId)).toEqual(before);
  });

  it('refuse une nature inconnue et une formation étrangère sans révéler son existence (CL-1, CA-4)', async () => {
    const userId = await createUser('rls');
    const seed = await seedGaps(userId);
    const before = await writeCounts(userId);

    const invalid = await listGaps(context(userId), {
      formationId: seed.formationId,
      nature: 'unknown' as never,
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe('VALIDATION_FAILED');

    const strangerId = await createUser('stranger');
    const foreign = await listGaps(context(strangerId), { formationId: seed.formationId });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) {
      expect(foreign.error).toBeInstanceOf(AppError);
      expect(foreign.error.code).toBe('NOT_FOUND');
    }
    expect(await writeCounts(userId)).toEqual(before);
  });

  it('renvoie un état vide sans lacune et retire l’ancre d’une section supprimée (CL-3, ET-5)', async () => {
    const userId = await createUser('empty');
    const seed = await seedGaps(userId);

    await serviceDb().execute(sql`
      delete from public.course_sections where id = ${seed.sectionIds[0]}::uuid
    `);
    const afterDeletion = await listGaps(context(userId), {
      formationId: seed.formationId,
      nature: 'confusion',
    });
    expect(afterDeletion.ok).toBe(true);
    if (afterDeletion.ok) expect(afterDeletion.value.items[0]?.course).toBeNull();

    const emptyUser = await createUser('blank');
    const empty = await serviceDb().transaction(async (tx) => {
      const programme = await createTestProgramme(tx, emptyUser, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
        title: 'Formation vide',
      });
      return programme;
    });
    const emptyResult = await listGaps(context(emptyUser), {
      formationId: empty.formationId,
    });
    expect(emptyResult.ok).toBe(true);
    if (emptyResult.ok) {
      expect(emptyResult.value.items).toEqual([]);
      expect(emptyResult.value.summary.openGaps).toBe(0);
      expect(emptyResult.value.countsByNature).toEqual({
        forgetting: 0,
        confusion: 0,
        misunderstanding: 0,
        application: 0,
      });
      expect(emptyResult.value.nextReviewAt).toBeNull();
    }
  });
});
