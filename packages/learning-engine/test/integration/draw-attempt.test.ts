import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';
import {
  calculateMastery,
  detectGap,
  drawAttempt,
  type AnswerRecord,
  type DrawBrick,
  type DrawGap,
  type DrawNotion,
  type GapAttempt,
  type GapParams,
  type MasteryAnswer,
} from '@learny/learning-engine';
import { REFERENCE_NOW, SAP_NOTIONS } from '@learny/learning-engine/fixtures';
import { buildAnswer } from '@learny/learning-engine/fixtures/builders';

const NOTIONS = SAP_NOTIONS.filter((notion) => notion.moduleId === 'sap-m3').slice(0, 8);
const GAP_NOTIONS = new Set(['n-cle', 'n-equilibre']);
const PARAMS = {
  ...ENGINE.draw,
  masteryThreshold: ENGINE.mastery.threshold,
} as const;
const GAP_PARAMS: GapParams = {
  ...ENGINE.gaps,
  masteryThreshold: ENGINE.mastery.threshold,
};
const OLD_SUCCESS = '2026-09-01T12:20:00.000Z';

let sequence = 0;

function fingerprint(value: number): string {
  return value.toString(16).padStart(64, '0');
}

function answer(
  notionId: string,
  partial: Partial<AnswerRecord> & Pick<AnswerRecord, 'answerId' | 'attemptId'>,
): AnswerRecord {
  return buildAnswer({
    notionIds: [notionId],
    countsForGaps: true,
    ...partial,
  });
}

function masteryAnswer(record: AnswerRecord): MasteryAnswer {
  return {
    answerId: record.answerId,
    attemptId: record.attemptId,
    score: (record.score ?? 0) / (record.maxScore ?? 1),
    answeredAt: record.answeredAt,
  };
}

function masteryOf(answers: readonly AnswerRecord[]): number {
  return calculateMastery({
    answers: answers.map(masteryAnswer),
    at: REFERENCE_NOW,
    threshold: ENGINE.mastery.threshold,
    halfLifeDays: ENGINE.mastery.halfLifeDays,
  }).mastery;
}

function drawNotions(): DrawNotion[] {
  return NOTIONS.map((notion) => {
    const answers = GAP_NOTIONS.has(notion.notionId)
      ? [
          answer(notion.notionId, {
            answerId: `a-old-${notion.notionId}`,
            attemptId: `t-old-${notion.notionId}`,
            score: 1,
            maxScore: 1,
            answeredAt: OLD_SUCCESS,
          }),
          answer(notion.notionId, {
            answerId: `a-fail-${notion.notionId}`,
            attemptId: `t-fail-${notion.notionId}`,
            score: 0,
            maxScore: 1,
            correct: false,
            chosenDistractorNotionId: 'n-type',
            answeredAt: REFERENCE_NOW,
          }),
        ]
      : [
          answer(notion.notionId, {
            answerId: `a-ok-${notion.notionId}`,
            attemptId: `t-ok-${notion.notionId}`,
            score: 1,
            maxScore: 1,
            answeredAt: REFERENCE_NOW,
          }),
        ];
    return {
      ...notion,
      mastery: masteryOf(answers),
    };
  });
}

function gapsOf(notions: readonly DrawNotion[]): DrawGap[] {
  const gaps: DrawGap[] = [];
  for (const notion of notions) {
    const failure = answer(notion.notionId, {
      answerId: `a-gap-${notion.notionId}`,
      attemptId: `t-gap-${notion.notionId}`,
      score: 0,
      maxScore: 1,
      correct: false,
      chosenDistractorNotionId: 'n-type',
      answeredAt: REFERENCE_NOW,
    });
    const attempts: GapAttempt[] = GAP_NOTIONS.has(notion.notionId)
      ? [
          {
            attemptId: `t-gap-${notion.notionId}`,
            attemptKind: 'validation_quiz',
            answers: [failure],
          },
        ]
      : [];
    const detected = detectGap({
      notion: notion.notionId,
      attempts,
      mastery: notion.mastery ?? 0,
      now: REFERENCE_NOW,
      params: GAP_PARAMS,
    });
    if (detected.active && detected.nature !== null) {
      gaps.push({ notionId: notion.notionId, nature: detected.nature });
    }
  }
  return gaps;
}

function brick(notionId: string, format: DrawBrick['format']): DrawBrick {
  sequence += 1;
  return {
    brickId: `b-${String(sequence)}`,
    brickVersionId: `v-${String(sequence)}`,
    notionIds: [notionId],
    format,
    status: 'active',
    valid: true,
    ownedByLearner: true,
    fingerprint: fingerprint(30_000 + sequence),
  };
}

function bank(): DrawBrick[] {
  const bricks: DrawBrick[] = [];
  for (const notion of NOTIONS) {
    bricks.push(brick(notion.notionId, 'choice_question'));
    bricks.push(brick(notion.notionId, 'cloze'));
    bricks.push(brick(notion.notionId, 'matching'));
    bricks.push(brick(notion.notionId, 'open_question'));
    bricks.push(brick(notion.notionId, 'open_question'));
  }
  return bricks;
}

describe('[SPEC-405] composition', () => {
  it('reflète les paramètres normatifs du moteur (CA-1, CA-3)', () => {
    expect(PARAMS).toMatchObject({
      defaultSize: ENGINE.draw.defaultSize,
      minSize: ENGINE.draw.minSize,
      maxSize: ENGINE.draw.maxSize,
      openShare: ENGINE.draw.openShare,
      minOpen: ENGINE.draw.minOpen,
      gapWeight: ENGINE.draw.gapWeight,
      weakWeight: ENGINE.draw.weakWeight,
      baseWeight: ENGINE.draw.baseWeight,
      totalPoints: ENGINE.draw.totalPoints,
      masteryThreshold: ENGINE.mastery.threshold,
    });
  });

  it('compose la maîtrise, les lacunes et le tirage (CA-1 à CA-3)', () => {
    const notions = drawNotions();
    const gaps = gapsOf(notions);
    expect(gaps.map((gap) => gap.notionId).sort()).toEqual(
      [...GAP_NOTIONS].sort((left, right) => left.localeCompare(right)),
    );

    const bricks = bank();
    const seen = [bricks[0]?.fingerprint, bricks[10]?.fingerprint].filter(
      (value): value is string => value !== undefined,
    );
    const result = drawAttempt({
      notions,
      bank: bricks,
      seenFingerprints: seen,
      gaps,
      params: PARAMS,
      seed: 'user-module-attempt-1',
    });

    expect(result.size).toBe(12);
    expect(result.minimumReached).toBe(true);
    expect(result.coverageLimited).toBe(false);
    expect(result.uncoveredNotionIds).toEqual([]);
    expect(result.exhausted).toEqual([]);
    expect(result.exhaustedFormats).toEqual([]);
    expect(result.plan.reduce((sum, entry) => sum + entry.quota, 0)).toBe(12);
    for (const notion of notions) {
      expect(
        result.questions.some((question) => question.notionIds.includes(notion.notionId)),
        notion.notionId,
      ).toBe(true);
    }
    expect(result.questions.some((question) => seen.includes(question.fingerprint))).toBe(false);

    const gapPlans = result.plan.filter((entry) => GAP_NOTIONS.has(entry.notionId));
    expect(gapPlans.every((entry) => entry.gap)).toBe(true);
    expect(gapPlans.every((entry) => entry.weight === ENGINE.draw.gapWeight)).toBe(true);
    expect(Math.min(...gapPlans.map((entry) => entry.quota))).toBeGreaterThan(
      ENGINE.draw.baseWeight,
    );

    const opens = result.questions.filter((question) => question.share === 'open');
    expect(opens.length).toBeGreaterThanOrEqual(ENGINE.draw.minOpen);
    expect(result.questions.reduce((sum, question) => sum + question.points, 0)).toBeCloseTo(
      ENGINE.draw.totalPoints,
      2,
    );

    const repeated = drawAttempt({
      notions: [...notions].reverse(),
      bank: [...bricks].reverse(),
      seenFingerprints: [...seen].reverse(),
      gaps: [...gaps].reverse(),
      params: PARAMS,
      seed: 'user-module-attempt-1',
    });
    expect(repeated.questions).toEqual(result.questions);
  });

  it('signale une notion sans banque et n’invente aucune question (CA-4)', () => {
    const notions = drawNotions();
    const gaps = gapsOf(notions);
    const missing = NOTIONS[0];
    if (missing === undefined) throw new Error('notion de référence absente');
    const bricks = bank().filter((entry) => !entry.notionIds.includes(missing.notionId));
    const result = drawAttempt({
      notions,
      bank: bricks,
      seenFingerprints: [],
      gaps,
      params: PARAMS,
      seed: 'attempt-exhausted',
    });

    expect(result.uncoveredNotionIds).toContain(missing.notionId);
    expect(
      result.exhausted.some(
        (entry) => entry.notionId === missing.notionId && entry.reason === 'bank_exhausted',
      ),
    ).toBe(true);
    expect(result.questions.some((question) => question.notionId === missing.notionId)).toBe(false);
    expect(result.minimumReached).toBe(true);
  });

  it('signale la limite de couverture au-delà de 20 notions (CA-4)', () => {
    const notions = SAP_NOTIONS.slice(0, 21).map<DrawNotion>((notion) => ({
      ...notion,
      mastery: 70,
    }));
    const bricks = notions.flatMap((notion) => [
      brick(notion.notionId, 'choice_question'),
      brick(notion.notionId, 'open_question'),
    ]);
    const result = drawAttempt({
      notions,
      bank: bricks,
      seenFingerprints: [],
      gaps: [],
      params: PARAMS,
      targetCount: ENGINE.draw.maxSize,
      seed: 'attempt-21-notions',
    });

    expect(result.coverageLimited).toBe(true);
    expect(result.size).toBe(ENGINE.draw.maxSize);
    expect(result.uncoveredNotionIds).toHaveLength(1);
    expect(result.exhausted.some((entry) => entry.reason === 'capacity')).toBe(true);
  });
});
