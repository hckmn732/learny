// Integration test of the daily offline pack (SPEC-801 §12, CA-2): the pack of a real learner
// contains the session of the day with full brick payloads, at most twenty extra cards per
// formation, and creates no `ai_calls` row (no AI call during preload).
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';

import { createBrick } from '../../src/bricks';
import { createServiceContext, type ServiceContext } from '../../src/context';
import { buildPack } from '../../src/offline';

const PREFIX = 'sdd-801-pack-';
const FIXED = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface Learner {
  userId: string;
  email: string;
  formationId: string;
  notionIds: string[];
  ctx: ServiceContext;
}

async function cleanup(): Promise<void> {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
}

afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

const RECALL = {
  front: 'Que définit une variante d’exercice comptable ?',
  back: 'Le nombre de périodes comptables d’un exercice.',
  sourceLabel: 'votre cours du module 1',
  sources: [],
};

async function createLearner(notions: number): Promise<Learner> {
  const email = `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`;
  const base = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email, timezone: 'Europe/Paris' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: notions,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0];
    if (moduleId === undefined) throw new Error('module absent');
    await createTestCourse(tx, { ownerId: user.id, moduleId });
    await tx.execute(
      sql`update public.modules set status = 'validated' where formation_id = ${programme.formationId}::uuid`,
    );
    return { user, programme };
  });
  return {
    userId: base.user.id,
    email,
    formationId: base.programme.formationId,
    notionIds: base.programme.notionIds,
    ctx: createServiceContext({
      userId: base.user.id,
      email,
      requestId: randomUUID(),
      clock: new TestClock(),
    }),
  };
}

async function prepare(learner: Learner): Promise<void> {
  for (const notionId of learner.notionIds) {
    await serviceDb().transaction(async (tx) => {
      await createNotionState(tx, {
        userId: learner.userId,
        notionId,
        mastery: 70,
        dueAt: new Date('2026-11-11T08:00:00Z'),
      });
    });
    const created = await createBrick(learner.ctx, {
      type: 'recall_card',
      formationId: learner.formationId,
      purpose: 'review',
      origin: 'tutor',
      notionIds: [notionId],
      payload: RECALL,
      createdBy: 'tutor',
    });
    if (!created.ok) throw created.error;
  }
}

describe('[SPEC-801] paquet hors ligne', () => {
  it('contient la session du jour avec les charges complètes, sans appel IA (CA-2, ET-5)', async () => {
    const learner = await createLearner(2);
    await prepare(learner);
    const before = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.ai_calls where user_id = ${learner.userId}::uuid
    `);
    const pack = await buildPack(learner.ctx);
    expect(pack.ok).toBe(true);
    if (!pack.ok) throw pack.error;
    expect(pack.value.ownerId).toBe(learner.userId);
    expect(pack.value.localDate).toBe('2026-11-11');
    expect(pack.value.formations).toHaveLength(1);
    const formation = pack.value.formations[0];
    expect(formation?.formationTitle).toBe('SAP S/4HANA Finance');
    expect(formation?.session.items.length).toBeGreaterThan(0);
    expect(formation?.session.items.every((item) => item.type === 'recall_card')).toBe(true);
    expect(
      formation?.session.items.every(
        (item) =>
          typeof item.payload === 'object' && item.payload !== null && 'back' in item.payload,
      ),
    ).toBe(true);
    expect((formation?.extraCards.length ?? 0) <= 20).toBe(true);
    const after = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.ai_calls where user_id = ${learner.userId}::uuid
    `);
    expect(after[0]?.count).toBe(before[0]?.count ?? 0);
  });

  it('renvoie une session vide pour une formation sans notion due (ET-5)', async () => {
    const learner = await createLearner(1);
    const pack = await buildPack(learner.ctx);
    expect(pack.ok).toBe(true);
    if (!pack.ok) throw pack.error;
    expect(pack.value.formations[0]?.session.items).toEqual([]);
    expect(pack.value.formations[0]?.extraCards).toEqual([]);
  });
});
