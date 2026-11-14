// Integration tests of the four global-quiz games (SPEC-702 §12, CA-1 to CA-7, CL-3, CL-4, CL-6).
//
// Postgres is real: the brick payloads are created through the service, the session is drawn by
// the engine, then each game is answered through `answerReviewItem`. Assertions cover the answer
// row, the per-notion FSRS journal, the confusions and the client-safe charge.
import { randomUUID } from 'node:crypto';

import type { SQL } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { opaqueMapping, type BrickPayload, type BrickType } from '@learny/bricks';
import type { AppError, Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';

import { createBrick } from '../../src/bricks';
import { createServiceContext, type ServiceContext } from '../../src/context';
import { answerReviewItem, getOrCreateTodaySession } from '../../src/review';

const PREFIX = 'sdd-702-';
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

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

async function createLearner(label: string, options: { notions: number }): Promise<Learner> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const base = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email, timezone: 'Europe/Paris' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: options.notions,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0];
    if (moduleId === undefined) throw new Error('module de test absent');
    const course = await createTestCourse(tx, { ownerId: user.id, moduleId });
    await tx.execute(sql`
      update public.modules set status = 'validated' where formation_id = ${programme.formationId}::uuid
    `);
    return { user, programme, course };
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

async function dueState(learner: Learner, notionId: string): Promise<void> {
  await serviceDb().transaction(async (tx) => {
    await createNotionState(tx, {
      userId: learner.userId,
      notionId,
      gapNature: null,
      mastery: 70,
      dueAt: new Date('2026-11-11T08:00:00Z'),
    });
  });
}

async function createGame<B extends BrickType>(
  learner: Learner,
  type: B,
  notionIds: string[],
  payload: BrickPayload<B>,
): Promise<{ brickId: string; versionId: string }> {
  const created = await createBrick(learner.ctx, {
    type,
    formationId: learner.formationId,
    purpose: 'review',
    origin: 'tutor',
    notionIds,
    payload,
    createdBy: 'tutor',
  });
  if (!created.ok) throw created.error;
  return { brickId: created.value.brickId, versionId: created.value.versionId };
}

interface SessionItem {
  position: number;
  type: string;
  brickVersionId: string;
  notionIds: string[];
  payload: unknown;
}

async function openSession(learner: Learner): Promise<{
  sessionId: string;
  items: SessionItem[];
  item: (type: string) => SessionItem;
}> {
  const session = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
  expect(session.ok).toBe(true);
  if (!session.ok) throw session.error;
  const sessionId = session.value.sessionId;
  if (sessionId === null) throw new Error('session de test absente');
  const items = session.value.items as SessionItem[];
  return {
    sessionId,
    items,
    item: (type) => {
      const found = items.find((entry) => entry.type === type);
      if (found === undefined) throw new Error(`jeu ${type} absent de la session`);
      return found;
    },
  };
}

async function answer(
  learner: Learner,
  sessionId: string,
  item: SessionItem,
  response: unknown,
): Promise<{
  request: { ok: true; value: unknown } | { ok: false; error: AppError };
  clientAnswerId: string;
}> {
  const clientAnswerId = randomUUID();
  const result = await answerReviewItem(learner.ctx, sessionId, {
    position: item.position,
    clientAnswerId,
    timeMs: 42_000,
    response,
  });
  return {
    request: result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error },
    clientAnswerId,
  };
}

interface AnswerRow {
  [key: string]: unknown;
  is_correct: boolean | null;
  score: string | null;
  max_score: string | null;
  feedback: unknown;
}

async function answerRow(clientAnswerId: string): Promise<AnswerRow | undefined> {
  const rows = await serviceDb().execute<AnswerRow>(sql`
    select is_correct, score::text as score, max_score::text as max_score, feedback
    from public.answers
    where feedback->>'clientAnswerId' = ${clientAnswerId}
  `);
  return rows[0];
}

async function reviewLogs(learner: Learner): Promise<{ notion_id: string; grade: string }[]> {
  return serviceDb().execute<{ notion_id: string; grade: string }>(sql`
    select notion_id::text as notion_id, grade::text as grade
    from public.review_logs
    where user_id = ${learner.userId}::uuid
    order by notion_id
  `);
}

async function countRows(query: SQL): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(query);
  return rows[0]?.count ?? 0;
}

const MATCHING_PAYLOAD: BrickPayload<'matching'> = {
  instruction: 'Notions de base SAP : reliez chaque notion à sa définition.',
  pairs: [
    {
      id: 'p1',
      left: 'Société',
      right: 'Entité juridique qui tient sa propre comptabilité',
      notionId: '11111111-1111-4111-8111-111111111111',
    },
    {
      id: 'p2',
      left: 'Plan comptable',
      right: 'Liste des comptes généraux utilisables',
      notionId: '11111111-1111-4111-8111-111111111112',
    },
    {
      id: 'p3',
      left: 'Launchpad Fiori',
      right: 'Page d’accueil qui regroupe les applications',
      notionId: '11111111-1111-4111-8111-111111111113',
    },
  ],
  extraRights: [],
  explanation:
    'La société porte les comptes, le plan comptable les liste et le launchpad les expose.',
  sources: [],
};

function matchingPayload(notionIds: string[]): BrickPayload<'matching'> {
  return {
    ...MATCHING_PAYLOAD,
    pairs: MATCHING_PAYLOAD.pairs.map((pair, index) => ({
      ...pair,
      notionId: notionIds[index] ?? notionIds[0] ?? pair.notionId,
    })),
  };
}

function rightFor(payload: BrickPayload<'matching'>, versionId: string, pairId: string): string {
  const right = opaqueMapping(payload, versionId).find((entry) => entry.pairId === pairId);
  if (right === undefined) throw new Error(`droite opaque de ${pairId} absente`);
  return right.id;
}

function orderingPayload(): BrickPayload<'ordering'> {
  return {
    instruction: 'Niveaux d’organisation : remettez les niveaux SAP dans l’ordre.',
    items: [
      { id: 'o1', text: 'Mandant' },
      { id: 'o2', text: 'Société' },
      { id: 'o3', text: 'Division' },
      { id: 'o4', text: 'Magasin' },
    ],
    explanation:
      'Le mandant contient les sociétés, qui se découpent en divisions puis en magasins.',
    sources: [],
  };
}

function categorizationPayload(
  categoryNotions: [string | null, string | null],
): BrickPayload<'categorization'> {
  return {
    instruction: 'Données de base et opérations : classez chaque élément.',
    categories: [
      { id: 'c1', label: 'Donnée de base', notionId: categoryNotions[0] },
      { id: 'c2', label: 'Opération', notionId: categoryNotions[1] },
    ],
    items: [
      { id: 'i1', text: 'Compte général', categoryId: 'c1' },
      { id: 'i2', text: 'Fournisseur', categoryId: 'c1' },
      { id: 'i3', text: 'Facture d’achat', categoryId: 'c2' },
      { id: 'i4', text: 'Paiement', categoryId: 'c2' },
    ],
    explanation:
      'Les données de base décrivent les objets ; les opérations les mettent en mouvement.',
    sources: [],
  };
}

function clozePayload(gapAnswers: [string[], string[]]): BrickPayload<'cloze'> {
  return {
    template:
      'Dans SAP Fiori, chaque application s’ouvre depuis une {{1}} du launchpad, et une société tient sa comptabilité dans sa devise {{2}}.',
    gaps: [
      { id: 1, answers: gapAnswers[0], hint: 'Élément du launchpad' },
      { id: 2, answers: gapAnswers[1], hint: 'Devise de tenue des comptes' },
    ],
    explanation:
      'La tuile ouvre l’application ; la devise interne porte la comptabilité de la société.',
    sources: [],
  };
}

describe('[SPEC-702] correction des jeux', () => {
  it('CA-1 — association juste : score 1, is_correct et une note non again par notion', async () => {
    const learner = await createLearner('match-ok', { notions: 3 });
    for (const notionId of learner.notionIds) await dueState(learner, notionId);
    const payload = matchingPayload(learner.notionIds);
    const brick = await createGame(learner, 'matching', learner.notionIds, payload);
    const session = await openSession(learner);
    const item = session.item('matching');

    const { request, clientAnswerId } = await answer(learner, session.sessionId, item, {
      pairs: payload.pairs.map((pair) => ({
        leftId: pair.id,
        rightId: rightFor(payload, brick.versionId, pair.id),
      })),
    });
    expect(request.ok).toBe(true);
    if (!request.ok) throw new Error('réponse refusée');
    const value = request.value as {
      isCorrect: boolean;
      correction: { kind: string; pairs: { ok: boolean }[] };
      notions: { rating: string }[];
    };
    expect(value.isCorrect).toBe(true);
    expect(value.correction.kind).toBe('matching');
    expect(value.correction.pairs.every((pair) => pair.ok)).toBe(true);
    expect(value.notions).toHaveLength(3);
    expect(value.notions.every((notion) => notion.rating !== 'again')).toBe(true);

    const row = await answerRow(clientAnswerId);
    expect(row?.is_correct).toBe(true);
    expect(Number(row?.score)).toBe(1);
    expect(Number(row?.max_score)).toBe(1);
    expect((row?.feedback as { confusions: unknown[] }).confusions).toEqual([]);
    const logs = await reviewLogs(learner);
    expect(logs).toHaveLength(3);
    expect(logs.every((log) => log.grade !== 'again')).toBe(true);
  });

  it('CA-2 — association : une définition de B sur le terme de A devient une confusion', async () => {
    const learner = await createLearner('match-ko', { notions: 3 });
    for (const notionId of learner.notionIds) await dueState(learner, notionId);
    const payload = matchingPayload(learner.notionIds);
    const brick = await createGame(learner, 'matching', learner.notionIds, payload);
    const session = await openSession(learner);
    const item = session.item('matching');
    const [, , notionB] = learner.notionIds;

    const { request, clientAnswerId } = await answer(learner, session.sessionId, item, {
      pairs: [
        {
          leftId: 'p1',
          rightId: rightFor(payload, brick.versionId, 'p2'),
        },
        {
          leftId: 'p2',
          rightId: rightFor(payload, brick.versionId, 'p2'),
        },
        {
          leftId: 'p3',
          rightId: rightFor(payload, brick.versionId, 'p3'),
        },
      ],
    });
    expect(request.ok).toBe(true);
    if (!request.ok) throw new Error('réponse refusée');
    const value = request.value as {
      isCorrect: boolean;
      notions: { notionId: string; rating: string }[];
    };
    expect(value.isCorrect).toBe(false);
    expect(value.notions.find((notion) => notion.notionId === learner.notionIds[0])?.rating).toBe(
      'again',
    );
    expect(value.notions.find((notion) => notion.notionId === notionB)?.rating).not.toBe('again');

    const row = await answerRow(clientAnswerId);
    const confusions = (
      row?.feedback as { confusions: { notionId: string; withNotionId: string }[] }
    ).confusions;
    expect(confusions).toEqual([
      { notionId: learner.notionIds[0], withNotionId: learner.notionIds[1] },
    ]);
    expect(Number(row?.score)).toBe(0.67);
  });

  it('CA-3 — remise en ordre : ordre juste, puis positions attendues sur un ordre faux', async () => {
    const good = await createLearner('order-ok', { notions: 1 });
    await dueState(good, good.notionIds[0] as string);
    await createGame(good, 'ordering', [good.notionIds[0] as string], orderingPayload());
    const goodSession = await openSession(good);
    const goodItem = goodSession.item('ordering');
    const correct = await answer(good, goodSession.sessionId, goodItem, {
      order: ['o1', 'o2', 'o3', 'o4'],
    });
    expect(correct.request.ok).toBe(true);
    if (!correct.request.ok) throw new Error('réponse refusée');
    expect((correct.request.value as { isCorrect: boolean }).isCorrect).toBe(true);

    const bad = await createLearner('order-ko', { notions: 2 });
    for (const notionId of bad.notionIds) await dueState(bad, notionId);
    await createGame(bad, 'ordering', bad.notionIds, orderingPayload());
    const badSession = await openSession(bad);
    const badItem = badSession.item('ordering');
    const partial = await answer(bad, badSession.sessionId, badItem, {
      order: ['o2', 'o1', 'o3', 'o4'],
    });
    expect(partial.request.ok).toBe(true);
    if (!partial.request.ok) throw new Error('réponse refusée');
    const value = partial.request.value as {
      isCorrect: boolean;
      correction: {
        rows: { stepId: string; position: number; ok: boolean; expectedPosition: number }[];
      };
    };
    expect(value.isCorrect).toBe(false);
    const rows = new Map(value.correction.rows.map((row) => [row.stepId, row]));
    expect(rows.get('o2')).toMatchObject({ position: 1, ok: false, expectedPosition: 2 });
    expect(rows.get('o1')).toMatchObject({ position: 2, ok: false, expectedPosition: 1 });
    expect(rows.get('o3')).toMatchObject({ position: 3, ok: true, expectedPosition: 3 });
    expect(rows.get('o4')).toMatchObject({ position: 4, ok: true, expectedPosition: 4 });
    const row = await answerRow(partial.clientAnswerId);
    expect(Number(row?.score)).toBe(0.5);
  });

  it('CA-4 — classement : juste, puis « Attendu : » et confusion sur un élément mal classé', async () => {
    const learner = await createLearner('categorize', { notions: 2 });
    for (const notionId of learner.notionIds) await dueState(learner, notionId);
    const payload = categorizationPayload([
      learner.notionIds[0] as string,
      learner.notionIds[1] as string,
    ]);
    await createGame(learner, 'categorization', learner.notionIds, payload);
    const session = await openSession(learner);
    const item = session.item('categorization');

    const { request, clientAnswerId } = await answer(learner, session.sessionId, item, {
      assignments: [
        { itemId: 'i1', categoryId: 'c2' },
        { itemId: 'i2', categoryId: 'c1' },
        { itemId: 'i3', categoryId: 'c2' },
        { itemId: 'i4', categoryId: 'c2' },
      ],
    });
    expect(request.ok).toBe(true);
    if (!request.ok) throw new Error('réponse refusée');
    const value = request.value as {
      isCorrect: boolean;
      correction: {
        rows: {
          itemId: string;
          ok: boolean;
          expectedCategoryId: string;
          expectedCategoryLabel: string;
        }[];
      };
    };
    expect(value.isCorrect).toBe(false);
    const wrong = value.correction.rows.find((row) => row.itemId === 'i1');
    expect(wrong).toMatchObject({
      ok: false,
      expectedCategoryId: 'c1',
      expectedCategoryLabel: 'Donnée de base',
    });
    const row = await answerRow(clientAnswerId);
    expect((row?.feedback as { confusions: unknown[] }).confusions).toEqual([
      { notionId: learner.notionIds[0], withNotionId: learner.notionIds[1] },
    ]);
    expect(Number(row?.score)).toBe(0.75);
  });

  it('CL-6 — classement sans notion de catégorie : erreurs seulement, aucune confusion', async () => {
    const learner = await createLearner('categorize-nonotion', { notions: 1 });
    await dueState(learner, learner.notionIds[0] as string);
    await createGame(
      learner,
      'categorization',
      learner.notionIds,
      categorizationPayload([null, null]),
    );
    const session = await openSession(learner);
    const item = session.item('categorization');
    const { request, clientAnswerId } = await answer(learner, session.sessionId, item, {
      assignments: [
        { itemId: 'i1', categoryId: 'c2' },
        { itemId: 'i2', categoryId: 'c1' },
        { itemId: 'i3', categoryId: 'c2' },
        { itemId: 'i4', categoryId: 'c2' },
      ],
    });
    expect(request.ok).toBe(true);
    const row = await answerRow(clientAnswerId);
    expect((row?.feedback as { confusions: unknown[] }).confusions).toEqual([]);
  });

  it('CA-5 — texte à trous : casse et accents acceptés, variante acceptée, faute refusée', async () => {
    const learner = await createLearner('cloze', { notions: 1 });
    const notionId = learner.notionIds[0] as string;
    await dueState(learner, notionId);
    await createGame(
      learner,
      'cloze',
      [notionId],
      clozePayload([['tuile'], ['devise interne', 'interne']]),
    );
    const session = await openSession(learner);
    const item = session.item('cloze');

    const { request, clientAnswerId } = await answer(learner, session.sessionId, item, {
      gaps: [
        { gapId: '1', value: 'Tuile' },
        { gapId: '2', value: 'DEVISE INTERNE' },
      ],
    });
    expect(request.ok).toBe(true);
    if (!request.ok) throw new Error('réponse refusée');
    const value = request.value as {
      isCorrect: boolean;
      correction: { gaps: { gapId: string; ok: boolean; expected: string; given?: string }[] };
    };
    expect(value.isCorrect).toBe(true);
    expect(value.correction.gaps).toEqual([
      { gapId: '1', ok: true, expected: 'tuile', given: 'Tuile' },
      { gapId: '2', ok: true, expected: 'devise interne', given: 'DEVISE INTERNE' },
    ]);
    const row = await answerRow(clientAnswerId);
    expect(row?.is_correct).toBe(true);

    const typo = await createLearner('cloze-typo', { notions: 1 });
    await dueState(typo, typo.notionIds[0] as string);
    await createGame(
      typo,
      'cloze',
      [typo.notionIds[0] as string],
      clozePayload([['tuile'], ['interne']]),
    );
    const typoSession = await openSession(typo);
    const typoItem = typoSession.item('cloze');
    const typoAnswer = await answer(typo, typoSession.sessionId, typoItem, {
      gaps: [
        { gapId: '1', value: 'tuille' },
        { gapId: '2', value: 'interne' },
      ],
    });
    expect(typoAnswer.request.ok).toBe(true);
    if (!typoAnswer.request.ok) throw new Error('réponse refusée');
    expect((typoAnswer.request.value as { isCorrect: boolean }).isCorrect).toBe(false);
    const typoRow = await answerRow(typoAnswer.clientAnswerId);
    expect(Number(typoRow?.score)).toBe(0.5);
  });

  it('ET-1 — réponse incomplète ou identifiant inconnu : 400 VALIDATION_FAILED sans écriture', async () => {
    const learner = await createLearner('invalid', { notions: 1 });
    await dueState(learner, learner.notionIds[0] as string);
    await createGame(
      learner,
      'cloze',
      [learner.notionIds[0] as string],
      clozePayload([['tuile'], ['interne']]),
    );
    const session = await openSession(learner);
    const item = session.item('cloze');

    const incomplete = await answerReviewItem(learner.ctx, session.sessionId, {
      position: item.position,
      clientAnswerId: randomUUID(),
      timeMs: 1_000,
      response: { gaps: [{ gapId: '1', value: 'tuile' }] },
    });
    expect(incomplete.ok).toBe(false);
    if (!incomplete.ok) {
      expect(incomplete.error.code).toBe('VALIDATION_FAILED');
      expect(incomplete.error.status ?? 400).toBe(400);
    }
    const unknown = await answerReviewItem(learner.ctx, session.sessionId, {
      position: item.position,
      clientAnswerId: randomUUID(),
      timeMs: 1_000,
      response: {
        gaps: [
          { gapId: '1', value: 'tuile' },
          { gapId: '9', value: 'interne' },
        ],
      },
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error.code).toBe('VALIDATION_FAILED');
      expect(unknown.error.status ?? 400).toBe(400);
    }
    expect(
      await countRows(sql`
        select count(*)::int as count from public.answers a
        join public.attempts at on at.id = a.attempt_id
        where at.user_id = ${learner.userId}::uuid
      `),
    ).toBe(0);
  });

  it('CA-7 — la charge de GET today ne contient aucune solution', async () => {
    const learner = await createLearner('payload', { notions: 5 });
    for (const notionId of learner.notionIds) await dueState(learner, notionId);
    const [n0, n1, n2, n3, n4] = learner.notionIds as [string, string, string, string, string];
    await createGame(learner, 'matching', [n0], matchingPayload([n0, n2, n3]));
    await createGame(learner, 'ordering', [n1], orderingPayload());
    await createGame(learner, 'categorization', [n2, n3], categorizationPayload([n2, n3]));
    await createGame(learner, 'cloze', [n4], clozePayload([['tuile'], ['interne']]));
    const session = await openSession(learner);
    const json = JSON.stringify(session.items);

    expect(session.items.map((item) => item.type).sort()).toEqual([
      'categorization',
      'cloze',
      'matching',
      'ordering',
    ]);
    expect(json).not.toContain('"correctOrder"');
    expect(json).not.toContain('"pairId"');
    expect(json).not.toContain('"categoryId"');
    expect(json).not.toContain('"answers"');
    expect(json).not.toContain('"correct":');
    const cloze = session.item('cloze').payload as { gaps: { id: number; hint?: string }[] };
    expect(cloze.gaps.every((gap) => !('answers' in gap))).toBe(true);
    const categorization = session.item('categorization').payload as {
      items: { id: string; text: string }[];
    };
    expect(categorization.items.every((entry) => !('categoryId' in entry))).toBe(true);
    const matching = session.item('matching').payload as {
      rights: { id: string; text: string }[];
    };
    expect(matching.rights.every((right) => !('pairId' in right))).toBe(true);
  });
});
