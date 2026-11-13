// Integration test of `gradeStoredBrick` (SPEC-502 §12, ET-6): real Postgres and RLS. A brick is
// created through the SPEC-501 service, its public payload is read with the same version id, then
// the opaque ids are fed back to the grader; no answer is written.
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { brickExamples, type BrickType } from '@learny/bricks';
import { type Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';

import { createBrick, getPublicBrick } from '../../src/bricks';
import { gradeStoredBrick } from '../../src/bricks/grade-service';
import { createServiceContext, type ServiceContext } from '../../src/context';

const PREFIX = 'sdd-502-';
const FIXED = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface Fixture {
  userId: string;
  email: string;
  formationId: string;
  notionIds: string[];
  ctx: ServiceContext;
}

async function fixture(label: string): Promise<Fixture> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
    });
    return {
      userId: user.id,
      email,
      formationId: programme.formationId,
      notionIds: programme.notionIds,
      ctx: createServiceContext({
        userId: user.id,
        email,
        requestId: randomUUID(),
        clock: new TestClock(),
      }),
    };
  });
}

function matchingPayload(notionIds: readonly string[]) {
  return {
    instruction: 'Associez chaque document à son cycle.',
    pairs: [
      { id: 'a', left: 'Facture', right: 'Cycle des ventes', notionId: notionIds[0] },
      { id: 'b', left: 'Relevé', right: 'Cycle de trésorerie', notionId: notionIds[1] },
    ],
    extraRights: ['Cycle des immobilisations'],
    explanation: 'Chaque pièce se rattache à un cycle comptable précis.',
    sources: [],
  };
}

function categorizationPayload(notionIds: readonly string[]) {
  return {
    instruction: 'Classez chaque compte.',
    categories: [
      { id: 'actif', label: 'Actif', notionId: notionIds[0] },
      { id: 'passif', label: 'Passif', notionId: notionIds[1] },
    ],
    items: [
      { id: 'a', text: 'Banque', categoryId: 'actif' },
      { id: 'b', text: 'Stock', categoryId: 'actif' },
      { id: 'c', text: 'Capital', categoryId: 'passif' },
      { id: 'd', text: 'Emprunt', categoryId: 'passif' },
    ],
    explanation: 'L’actif regroupe les emplois, le passif les ressources.',
    sources: [],
  };
}

async function create(
  fx: Fixture,
  type: BrickType,
  payload: unknown,
): Promise<{ brickId: string; versionId: string }> {
  const created = await createBrick(fx.ctx, {
    type,
    formationId: fx.formationId,
    purpose: 'bank',
    notionIds: type === 'timer' || type === 'scoring' ? [] : [fx.notionIds[0] as string],
    origin: 'tutor',
    payload,
    createdBy: 'tutor',
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw created.error;
  return { brickId: created.value.brickId, versionId: created.value.versionId };
}

interface PublicMatching {
  lefts: { id: string; text: string }[];
  rights: { id: string; text: string }[];
}

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-502] correction d’une brique enregistrée', () => {
  it('corrige une association avec les ids opaques de la charge publique (cohérence graine)', async () => {
    const fx = await fixture('matching');
    const payload = matchingPayload(fx.notionIds);
    const created = await create(fx, 'matching', payload);

    const publicBrick = await getPublicBrick(fx.ctx, created.versionId);
    expect(publicBrick.ok).toBe(true);
    if (!publicBrick.ok) return;
    const publicPayload = publicBrick.value.publicPayload as PublicMatching;
    const given = {
      pairs: Object.fromEntries(
        payload.pairs.map((pair) => [
          pair.id,
          publicPayload.rights.find((right) => right.text === pair.right)?.id ?? '',
        ]),
      ),
    };

    const graded = await gradeStoredBrick(fx.ctx, created.versionId, given);
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.isCorrect).toBe(true);
    expect(graded.value.score).toBe(1);
    expect(graded.value.feedbackTitle).toBe('Exact.');
  });

  it('enregistre une confusion entre deux notions lors d’une association fausse', async () => {
    const fx = await fixture('confusion');
    const payload = matchingPayload(fx.notionIds);
    const created = await create(fx, 'matching', payload);
    const publicBrick = await getPublicBrick(fx.ctx, created.versionId);
    if (!publicBrick.ok) throw publicBrick.error;
    const rights = (publicBrick.value.publicPayload as PublicMatching).rights;
    const otherRight = rights.find((right) => right.text === payload.pairs[1]?.right);

    const graded = await gradeStoredBrick(fx.ctx, created.versionId, {
      pairs: { a: otherRight?.id ?? null, b: otherRight?.id ?? null },
    });
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.isCorrect).toBe(false);
    expect(graded.value.confusions).toEqual([
      {
        notionId: fx.notionIds[0],
        confusedWithNotionId: fx.notionIds[1],
      },
    ]);
  });

  it('corrige un classement enregistré', async () => {
    const fx = await fixture('categorization');
    const created = await create(fx, 'categorization', categorizationPayload(fx.notionIds));

    const graded = await gradeStoredBrick(fx.ctx, created.versionId, {
      assignments: { a: 'actif', b: 'actif', c: 'passif', d: 'passif' },
    });
    expect(graded.ok).toBe(true);
    if (graded.ok) {
      expect(graded.value.isCorrect).toBe(true);
      expect(graded.value.correction.kind).toBe('categorization');
    }
  });

  it('refuse une réponse invalide (RESPONSE_INVALID, 422)', async () => {
    const fx = await fixture('invalid');
    const created = await create(fx, 'matching', matchingPayload(fx.notionIds));
    const graded = await gradeStoredBrick(fx.ctx, created.versionId, { pairs: { a: null } });
    expect(graded.ok).toBe(false);
    if (!graded.ok) {
      expect(graded.error.code).toBe('RESPONSE_INVALID');
      expect(graded.error.errors?.length).toBeGreaterThan(0);
    }
  });

  it('refuse une question ouverte, corrigée par le tuteur (422)', async () => {
    const fx = await fixture('open');
    const created = await create(fx, 'open_question', brickExamples.open_question.valid);
    const graded = await gradeStoredBrick(fx.ctx, created.versionId, {
      text: 'La partie double.',
    });
    expect(graded.ok).toBe(false);
    if (!graded.ok) expect(graded.error.code).toBe('GRADED_BY_TUTOR');
  });

  it('refuse une version d’un autre utilisateur (404)', async () => {
    const alice = await fixture('alice');
    const bob = await fixture('bob');
    const created = await create(alice, 'matching', matchingPayload(alice.notionIds));
    const graded = await gradeStoredBrick(bob.ctx, created.versionId, { pairs: {} });
    expect(graded.ok).toBe(false);
    if (!graded.ok) expect(graded.error.code).toBe('NOT_FOUND');
  });

  it('refuse un identifiant de version invalide', async () => {
    const fx = await fixture('bad-id');
    const graded = await gradeStoredBrick(fx.ctx, 'pas-un-uuid', {});
    expect(graded.ok).toBe(false);
    if (!graded.ok) expect(graded.error.code).toBe('VALIDATION_FAILED');
  });

  it('n’écrit aucune tentative ni réponse', async () => {
    const fx = await fixture('read-only');
    const created = await create(fx, 'matching', matchingPayload(fx.notionIds));
    const before = await serviceDb().execute<{ count: string }>(
      sql`select count(*)::text as count from public.answers`,
    );
    await gradeStoredBrick(fx.ctx, created.versionId, { pairs: { a: null, b: null } });
    const after = await serviceDb().execute<{ count: string }>(
      sql`select count(*)::text as count from public.answers`,
    );
    expect(after[0]?.count).toBe(before[0]?.count);
  });
});
