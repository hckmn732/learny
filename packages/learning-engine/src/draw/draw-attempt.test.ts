import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EngineError } from '../errors';
import type { BrickFormat } from '../types';

import {
  CHOICE_FORMATS,
  OPEN_FORMATS,
  drawAttempt,
  type DrawAttemptInput,
  type DrawBrick,
  type DrawGap,
  type DrawNotion,
  type DrawParams,
} from './index';

const PARAMS: DrawParams = {
  defaultSize: 12,
  minSize: 10,
  maxSize: 20,
  openShare: 0.3,
  minOpen: 1,
  gapWeight: 3,
  weakWeight: 2,
  baseWeight: 1,
  totalPoints: 100,
  masteryThreshold: 80,
};
const FAST_CHECK = { seed: 20261111, numRuns: 100 } as const;
const CHOICE_CYCLE: readonly BrickFormat[] = ['choice_question', 'cloze', 'matching'];

let sequence = 0;

function fingerprint(value: number): string {
  return value.toString(16).padStart(64, '0');
}

function notion(
  notionId: string,
  position: number,
  mastery: number | null = 85,
  modulePosition = 1,
): DrawNotion {
  return {
    notionId,
    moduleId: `m-${String(modulePosition)}`,
    chapterId: `c-${String(modulePosition)}`,
    modulePosition,
    position,
    label: `Notion ${notionId}`,
    mastery,
  };
}

function eightNotions(): DrawNotion[] {
  return Array.from({ length: 8 }, (_, index) =>
    notion(`n-${String(index + 1)}`, index, 70 + index),
  );
}

function brick(partial: Partial<DrawBrick> = {}): DrawBrick {
  sequence += 1;
  return {
    brickId: `b-${String(sequence)}`,
    brickVersionId: `v-${String(sequence)}`,
    notionIds: ['n-1'],
    format: 'choice_question',
    status: 'active',
    valid: true,
    ownedByLearner: true,
    fingerprint: fingerprint(sequence),
    ...partial,
  };
}

function bankFor(
  notionIds: readonly string[],
  options: { choice?: number; open?: number } = {},
): DrawBrick[] {
  const choice = options.choice ?? 3;
  const open = options.open ?? 2;
  const bricks: DrawBrick[] = [];
  for (const [index, notionId] of notionIds.entries()) {
    for (let turn = 0; turn < choice; turn += 1) {
      bricks.push(
        brick({
          notionIds: [notionId],
          format: CHOICE_CYCLE[turn % CHOICE_CYCLE.length] ?? 'choice_question',
          fingerprint: fingerprint(10_000 + index * 100 + turn),
        }),
      );
    }
    for (let turn = 0; turn < open; turn += 1) {
      bricks.push(
        brick({
          notionIds: [notionId],
          format: 'open_question',
          fingerprint: fingerprint(20_000 + index * 100 + turn),
        }),
      );
    }
  }
  return bricks;
}

function input(overrides: Partial<DrawAttemptInput> = {}): DrawAttemptInput {
  const notions = overrides.notions ?? eightNotions();
  return {
    notions,
    bank: bankFor(notions.map((entry) => entry.notionId)),
    seenFingerprints: [],
    gaps: [],
    params: PARAMS,
    seed: 'attempt-1',
    ...overrides,
  };
}

function engineError(run: () => unknown, path?: string): EngineError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    const engine = error as EngineError;
    expect(engine.code).toBe('INVALID_INPUT');
    if (path !== undefined) expect(engine.details?.path).toBe(path);
    return engine;
  }
  throw new Error('aucune EngineError levée');
}

function planOf(result: ReturnType<typeof drawAttempt>, notionId: string) {
  const entry = result.plan.find((item) => item.notionId === notionId);
  expect(entry).toBeDefined();
  return entry as NonNullable<typeof entry>;
}

describe('[SPEC-405] Tirage des questions d’une tentative', () => {
  it('couvre 8 notions avec 12 questions et une répartition proche de 70/30 (CA-1)', () => {
    const notions = eightNotions();
    const result = drawAttempt(input({ notions }));

    expect(result.size).toBe(12);
    expect(result.targetCount).toBe(12);
    expect(result.minimumReached).toBe(true);
    expect(result.uncoveredNotionIds).toEqual([]);
    expect(result.coverageLimited).toBe(false);
    expect(result.exhausted).toEqual([]);
    expect(result.exhaustedFormats).toEqual([]);

    for (const entry of notions) {
      expect(
        result.questions.some((question) => question.notionIds.includes(entry.notionId)),
        entry.notionId,
      ).toBe(true);
    }

    const opens = result.questions.filter((question) => question.share === 'open');
    const choices = result.questions.filter((question) => question.share === 'choice');
    expect(opens.length).toBe(4);
    expect(choices.length).toBe(8);
    expect(opens.length / result.size).toBeGreaterThanOrEqual(0.3);
    expect(opens.every((question) => question.format === 'open_question')).toBe(true);
    expect(choices.every((question) => CHOICE_FORMATS.includes(question.format))).toBe(true);

    expect(result.plan.reduce((sum, entry) => sum + entry.quota, 0)).toBe(12);
    expect(new Set(result.questions.map((question) => question.brickId)).size).toBe(12);
    expect(new Set(result.questions.map((question) => question.fingerprint)).size).toBe(12);
  });

  it('attribue les 100 points au centième, le dernier absorbant l’écart (ET-1)', () => {
    const result = drawAttempt(input());
    expect(result.pointsTotal).toBe(100);
    const points = result.questions.map((question) => question.points);
    expect(points).toHaveLength(12);
    expect(points.slice(0, 11)).toEqual(Array.from({ length: 11 }, () => 8.33));
    expect(points[11]).toBe(8.37);
    expect(points.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 2);
  });

  it('respecte les tailles 10, 12 et 20 et le quota d’ouvertes (ADR-0143)', () => {
    const notions = Array.from({ length: 20 }, (_, index) =>
      notion(`n-${String(index + 1)}`, index),
    );
    const bank = bankFor(notions.map((entry) => entry.notionId));
    for (const [targetCount, opens] of [
      [10, 3],
      [12, 4],
      [20, 6],
    ] as const) {
      const result = drawAttempt(input({ notions, bank, targetCount }));
      expect(result.size, String(targetCount)).toBe(targetCount);
      expect(result.questions.filter((question) => question.share === 'open')).toHaveLength(opens);
    }
  });

  it('surpondère les lacunes puis les maîtrises faibles (CA-3)', () => {
    const notions = [notion('n-base', 0, 90), notion('n-weak', 1, 60), notion('n-gap', 2, 40)];
    const result = drawAttempt(
      input({
        notions,
        targetCount: 12,
        gaps: [{ notionId: 'n-gap', nature: 'forgetting' }],
      }),
    );
    const base = planOf(result, 'n-base');
    const weak = planOf(result, 'n-weak');
    const gap = planOf(result, 'n-gap');

    expect(gap.weight).toBe(3);
    expect(weak.weight).toBe(2);
    expect(base.weight).toBe(1);
    expect(gap.quota).toBeGreaterThan(weak.quota);
    expect(weak.quota).toBeGreaterThan(base.quota);
    expect(result.plan[0]?.notionId).toBe('n-gap');
  });

  it('départage deux lacunes par la nature, confusion avant oubli (ADR-0143)', () => {
    const notions = [notion('n-forget', 0, 40), notion('n-confuse', 1, 40)];
    const gaps: DrawGap[] = [
      { notionId: 'n-forget', nature: 'forgetting' },
      { notionId: 'n-confuse', nature: 'confusion' },
    ];
    const result = drawAttempt(input({ notions, gaps }));
    expect(result.plan.map((entry) => entry.notionId)).toEqual(['n-confuse', 'n-forget']);
  });

  it('exclut les empreintes vues et ne retient qu’une variante par empreinte (CA-2, CL-2)', () => {
    const notions = [notion('n-1', 0), notion('n-2', 1)];
    const original = brick({
      notionIds: ['n-1'],
      fingerprint: fingerprint(777),
    });
    const variant = brick({
      notionIds: ['n-1'],
      brickId: 'duplicate-brick',
      brickVersionId: 'duplicate-version',
      fingerprint: fingerprint(777),
    });
    const seenBrick = brick({
      notionIds: ['n-2'],
      fingerprint: fingerprint(888),
    });
    const bank = [...bankFor(['n-1', 'n-2']), original, variant, seenBrick];
    const result = drawAttempt(input({ notions, bank, seenFingerprints: [fingerprint(888)] }));

    expect(result.diagnostics.duplicateFingerprints).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.seenExcluded).toBeGreaterThanOrEqual(1);
    expect(result.questions.some((question) => question.fingerprint === fingerprint(888))).toBe(
      false,
    );
    expect(result.questions.some((question) => question.brickId === seenBrick.brickId)).toBe(false);
    expect(
      result.questions.filter((question) => question.fingerprint === fingerprint(777)),
    ).toHaveLength(1);
    expect(result.questions.some((question) => question.brickId === 'duplicate-brick')).toBe(false);
    expect(new Set(result.questions.map((question) => question.fingerprint)).size).toBe(
      result.questions.length,
    );
  });

  it('ne tire que des briques actives, valides, possédées et liées (EF-4)', () => {
    const notions = [notion('n-1', 0), notion('n-2', 1)];
    const excluded = [
      brick({ notionIds: ['n-1'], status: 'reported' }),
      brick({ notionIds: ['n-1'], status: 'retired' }),
      brick({ notionIds: ['n-1'], valid: false }),
      brick({ notionIds: ['n-1'], ownedByLearner: false }),
      brick({ notionIds: ['n-1'], fingerprint: null }),
      brick({ notionIds: ['n-1'], format: 'instruction' }),
      brick({ notionIds: ['n-other'], format: 'choice_question' }),
    ];
    const result = drawAttempt(input({ notions, bank: [...bankFor(['n-1', 'n-2']), ...excluded] }));
    const excludedIds = new Set(excluded.map((entry) => entry.brickId));

    expect(result.diagnostics.bankSize).toBe(10 + excluded.length);
    expect(result.diagnostics.eligible).toBe(10);
    expect(result.questions.some((question) => excludedIds.has(question.brickId))).toBe(false);
    expect(result.questions.every((question) => question.brickVersionId.startsWith('v-'))).toBe(
      true,
    );
  });

  it('retourne un tirage identique à seed égale malgré l’ordre des entrées (CA-3, CL-5)', () => {
    const notions = eightNotions();
    const gaps: DrawGap[] = [
      { notionId: 'n-1', nature: 'confusion' },
      { notionId: 'n-2', nature: 'forgetting' },
    ];
    const base = input({
      notions,
      gaps,
      seenFingerprints: [fingerprint(10_001)],
      targetCount: 12,
    });
    const expected = drawAttempt(base);
    const permuted = drawAttempt({
      ...base,
      notions: [...base.notions].reverse(),
      bank: [...base.bank].reverse(),
      gaps: [...base.gaps].reverse(),
      seenFingerprints: [...base.seenFingerprints].reverse(),
    });

    expect(permuted.questions).toEqual(expected.questions);
    expect(permuted.plan).toEqual(expected.plan);
    expect(permuted.exhausted).toEqual(expected.exhausted);
  });

  it('produit un résultat invariant par toute permutation (CL-5, propriété)', () => {
    const base = input({
      notions: eightNotions(),
      gaps: [{ notionId: 'n-2', nature: 'application' }],
    });
    const expected = drawAttempt(base);
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...base.notions], {
          minLength: base.notions.length,
          maxLength: base.notions.length,
        }),
        fc.shuffledSubarray([...base.bank], {
          minLength: base.bank.length,
          maxLength: base.bank.length,
        }),
        (notions, bank) => {
          const result = drawAttempt({ ...base, notions, bank });
          expect(result.questions).toEqual(expected.questions);
          expect(result.plan.map((entry) => [entry.notionId, entry.quota])).toEqual(
            expected.plan.map((entry) => [entry.notionId, entry.quota]),
          );
        },
      ),
      FAST_CHECK,
    );
  });

  it('ne dépasse jamais la taille demandée et n’invente aucune question (propriété)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (choices, opens) => {
          const notions = eightNotions();
          const bank = bankFor(
            notions.map((entry) => entry.notionId),
            { choice: choices, open: opens },
          );
          const result = drawAttempt(input({ notions, bank }));
          const bankById = new Map(bank.map((entry) => [entry.brickId, entry]));
          expect(result.questions.length).toBeLessThanOrEqual(12);
          expect(result.questions.length).toBe(result.size);
          expect(new Set(result.questions.map((question) => question.fingerprint)).size).toBe(
            result.questions.length,
          );
          for (const question of result.questions) {
            const source = bankById.get(question.brickId);
            expect(source).toBeDefined();
            expect(source?.brickVersionId).toBe(question.brickVersionId);
            expect(source?.status).toBe('active');
            expect(source?.valid).toBe(true);
            expect(source?.ownedByLearner).toBe(true);
            expect(source?.fingerprint).toBe(question.fingerprint);
          }
        },
      ),
      FAST_CHECK,
    );
  });

  it('retourne liste vide et toutes les notions épuisées sur une banque vide (CL-1)', () => {
    const notions = eightNotions();
    const result = drawAttempt(input({ notions, bank: [] }));

    expect(result.questions).toEqual([]);
    expect(result.size).toBe(0);
    expect(result.minimumReached).toBe(false);
    expect(result.uncoveredNotionIds).toEqual(notions.map((entry) => entry.notionId));
    expect(result.exhausted).toHaveLength(notions.length);
    expect(result.exhausted.every((entry) => entry.reason === 'bank_exhausted')).toBe(true);
    expect(result.exhausted.every((entry) => entry.selected === 0)).toBe(true);
    expect(result.exhausted.every((entry) => entry.formats.length === 2)).toBe(true);
    expect(result.exhaustedFormats).toEqual(['open', 'choice']);
  });

  it('signale la capacité au-delà de 20 notions sans dépasser 20 questions (CL-3)', () => {
    const notions = Array.from({ length: 21 }, (_, index) =>
      notion(`n-${String(index + 1)}`, index, 60 + index),
    );
    const bank = bankFor(
      notions.map((entry) => entry.notionId),
      { choice: 1, open: 1 },
    );
    const result = drawAttempt(input({ notions, bank, targetCount: 20 }));

    expect(result.size).toBe(20);
    expect(result.coverageLimited).toBe(true);
    expect(result.uncoveredNotionIds).toHaveLength(1);
    const capacity = result.exhausted.filter((entry) => entry.reason === 'capacity');
    expect(capacity).toHaveLength(1);
    expect(capacity[0]?.notionId).toBe(result.uncoveredNotionIds[0]);
    expect(result.plan.find((entry) => entry.quota === 0)?.notionId).toBe(
      result.uncoveredNotionIds[0],
    );
  });

  it('signale l’épuisement du format ouvert sans bloquer le tirage (CL-4)', () => {
    const notions = eightNotions();
    const bank = bankFor(
      notions.map((entry) => entry.notionId),
      { choice: 3, open: 0 },
    );
    const result = drawAttempt(input({ notions, bank }));

    expect(result.size).toBe(12);
    expect(result.minimumReached).toBe(true);
    expect(result.questions.every((question) => question.share === 'choice')).toBe(true);
    expect(result.exhaustedFormats).toContain('open');
  });

  it('conserve une seule ouverte disponible et signale le manque (CL-4)', () => {
    const notions = [notion('n-1', 0)];
    const bank = [
      ...bankFor(['n-1'], { choice: 20, open: 0 }),
      brick({ notionIds: ['n-1'], format: 'open_question' }),
    ];
    const result = drawAttempt(input({ notions, bank, targetCount: 10 }));

    expect(result.questions.filter((question) => question.share === 'open')).toHaveLength(1);
    expect(result.exhaustedFormats).toContain('open');
    expect(result.minimumReached).toBe(true);
  });

  it('signale l’épuisement de la part choix quand seules des ouvertes existent', () => {
    const notions = [notion('n-1', 0)];
    const bank = bankFor(['n-1'], { choice: 0, open: 20 });
    const result = drawAttempt(input({ notions, bank, targetCount: 10 }));

    expect(result.questions.every((question) => question.share === 'open')).toBe(true);
    expect(result.exhaustedFormats).toContain('choice');
  });

  it('compte une brique liée à plusieurs notions pour chacune (ADR-0143)', () => {
    const notions = [notion('n-1', 0, 90), notion('n-2', 1, 90)];
    const shared = brick({
      notionIds: ['n-2', 'n-1'],
      format: 'choice_question',
      fingerprint: fingerprint(555),
    });
    const result = drawAttempt(input({ notions, bank: [shared] }));

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.notionIds).toEqual(['n-1', 'n-2']);
    expect(result.plan.every((entry) => entry.selected === 1)).toBe(true);
    expect(result.uncoveredNotionIds).toEqual([]);
    expect(result.exhausted.every((entry) => entry.reason === 'bank_exhausted')).toBe(true);
    expect(result.minimumReached).toBe(false);
  });

  it('donne des points exacts sur un tirage court (ET-1)', () => {
    const notions = [notion('n-1', 0)];
    const bank = bankFor(['n-1'], { choice: 2, open: 1 });
    const result = drawAttempt(input({ notions, bank, targetCount: 10 }));
    expect(result.size).toBe(3);
    expect(result.questions.map((question) => question.points)).toEqual([33.33, 33.33, 33.34]);
    expect(result.questions.reduce((sum, question) => sum + question.points, 0)).toBeCloseTo(
      100,
      2,
    );
  });

  it('rejette une taille cible hors bornes (ET-5)', () => {
    engineError(() => drawAttempt(input({ targetCount: 9 })), 'targetCount');
    engineError(() => drawAttempt(input({ targetCount: 21 })), 'targetCount');
    engineError(() => drawAttempt(input({ targetCount: 11.5 })), 'targetCount');
  });

  it('rejette des paramètres métier incohérents (ET-5)', () => {
    const malformed = { ...PARAMS, minSize: 21 };
    engineError(() => drawAttempt(input({ params: malformed })));
    const negative = { ...PARAMS, gapWeight: -1 };
    engineError(() => drawAttempt(input({ params: negative })));
    const zeroWeights = {
      ...PARAMS,
      gapWeight: 0,
      weakWeight: 0,
      baseWeight: 0,
    };
    engineError(() => drawAttempt(input({ params: zeroWeights })));
  });

  it('rejette une entrée mal typée sans effet de bord (ET-4)', () => {
    const malformed = {
      ...input(),
      bank: [{ ...brick(), status: 'unknown' }],
    } as unknown as DrawAttemptInput;
    engineError(() => drawAttempt(malformed));
    const badNotion = {
      ...input(),
      notions: [{ ...notion('n-1', 0), modulePosition: 0 }],
    } as unknown as DrawAttemptInput;
    engineError(() => drawAttempt(badNotion));
  });

  it('déduplique les notions et garde un ordre canonique (CL-5)', () => {
    const notions = [notion('n-2', 1, 90), notion('n-1', 0, 90), notion('n-2', 1, 90)];
    const bank = bankFor(['n-1', 'n-2']);
    const result = drawAttempt(input({ notions, bank, targetCount: 10 }));
    expect(result.plan.map((entry) => entry.notionId)).toEqual(['n-1', 'n-2']);
  });

  it('accepte une entrée vide sans erreur', () => {
    const result = drawAttempt(input({ notions: [], bank: [], targetCount: 10 }));
    expect(result.questions).toEqual([]);
    expect(result.plan).toEqual([]);
    expect(result.uncoveredNotionIds).toEqual([]);
    expect(result.coverageLimited).toBe(false);
    expect(result.minimumReached).toBe(false);
  });

  it('expose les formats des parts choix et ouvertes (ADR-0170)', () => {
    expect(CHOICE_FORMATS).toEqual(['choice_question', 'cloze', 'matching']);
    expect(OPEN_FORMATS).toEqual(['open_question']);
  });
});
