import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';

import {
  applyReview,
  calculateMastery,
  calculateProgress,
  calculateRetention,
  createNotionCard,
  instantAt,
  withParams,
} from '../../src/index';
import type { ProgressModule, ProgressNotionState, ProgressSlot } from '../../src/index';

const TZ = 'Europe/Paris';
const AT = '2026-11-11T12:20:00.000Z';
const VALIDATION = instantAt('2026-10-12', '12:00', TZ);
const REVIEW = instantAt('2026-11-11', '10:00', TZ);

const FSRS = withParams('fsrs');
const MASTERY = withParams('mastery');
const RETENTION = withParams('retention');
const RETENTION_PARAMS = {
  horizonsDays: RETENTION.horizonsDays,
  toleranceDays: RETENTION.toleranceDays,
};

function progressSlot(
  slotId: string,
  formationId: string,
  status: ProgressSlot['status'],
  minutes: number,
): ProgressSlot {
  const startMs = Date.parse('2026-11-09T09:00:00.000Z');
  return {
    slotId,
    formationId,
    moduleId: null,
    kind: 'course',
    status,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(startMs + minutes * 60_000).toISOString(),
  };
}

describe('[SPEC-408] composition', () => {
  it('compose FSRS, maîtrise, rétention et avancement avec les paramètres ENGINE', () => {
    const modules = [
      {
        moduleId: 'sap-m1',
        validatedAt: VALIDATION,
        notionIds: ['n1', 'n2'],
      },
    ];
    const reviews = [
      { reviewId: 'r1', notionId: 'n1', reviewedAt: REVIEW, correct: true },
      { reviewId: 'r2', notionId: 'n2', reviewedAt: REVIEW, correct: false },
    ];
    const retention = calculateRetention({
      modules,
      reviews,
      at: AT,
      timeZone: TZ,
      params: RETENTION_PARAMS,
    });
    expect(retention.find((item) => item.horizonDays === 30)).toMatchObject({
      reviewed: 2,
      successful: 1,
      rate: 50,
    });

    // The same dated instants drive the FSRS card and the mastery computation.
    const card = createNotionCard(VALIDATION, FSRS.requestRetention);
    const applied = applyReview(card, 'good', REVIEW, FSRS.requestRetention);
    expect(card.reps).toBe(0);
    expect(applied.dueAt > REVIEW).toBe(true);

    const success = calculateMastery({
      answers: [{ answerId: 'a1', attemptId: 't1', score: 1, answeredAt: REVIEW }],
      at: AT,
      threshold: MASTERY.threshold,
      halfLifeDays: MASTERY.halfLifeDays,
    });
    const failure = calculateMastery({
      answers: [{ answerId: 'a2', attemptId: 't2', score: 0, answeredAt: REVIEW }],
      at: AT,
      threshold: MASTERY.threshold,
      halfLifeDays: MASTERY.halfLifeDays,
    });
    const notionStates: ProgressNotionState[] = [
      { notionId: 'n1', mastery: success.mastery },
      { notionId: 'n2', mastery: failure.mastery },
    ];
    const progressModules: ProgressModule[] = [
      { moduleId: 'sap-m1', status: 'validated' },
      { moduleId: 'sap-m2', status: 'validated' },
      { moduleId: 'sap-m3', status: 'open' },
    ];
    const slots = [
      progressSlot('slot-1', 'formation-a', 'done', 60),
      progressSlot('slot-2', 'formation-a', 'planned', 30),
    ];
    const progress = calculateProgress({
      modules: progressModules,
      slots,
      notionStates,
      masteryThreshold: MASTERY.threshold,
    });
    expect(progress.validatedModules).toBe(2);
    expect(progress.totalModules).toBe(3);
    expect(progress.progressPercent).toBeCloseTo((2 / 3) * 100, 12);
    expect(progress.masteredNotions).toBe(1);
    expect(progress.plannedMinutes).toBe(90);
    expect(progress.completedMinutes).toBe(60);

    const repeated = calculateProgress({
      modules: [...progressModules].reverse(),
      slots: [...slots].reverse(),
      notionStates: [...notionStates].reverse(),
      masteryThreshold: MASTERY.threshold,
    });
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(progress));
  });

  it('ne mélange pas les métriques de deux apprenants de la même formation', () => {
    const modules: ProgressModule[] = [
      { moduleId: 'm1', status: 'validated' },
      { moduleId: 'm2', status: 'open' },
    ];
    const learnerA = calculateProgress({
      modules,
      slots: [progressSlot('a-1', 'formation-a', 'done', 60)],
      notionStates: [{ notionId: 'n1', mastery: 90 }],
      masteryThreshold: MASTERY.threshold,
    });
    const learnerB = calculateProgress({
      modules,
      slots: [progressSlot('b-1', 'formation-a', 'planned', 30)],
      notionStates: [{ notionId: 'n1', mastery: 40 }],
      masteryThreshold: MASTERY.threshold,
    });
    const learnerAAgain = calculateProgress({
      modules,
      slots: [progressSlot('a-1', 'formation-a', 'done', 60)],
      notionStates: [{ notionId: 'n1', mastery: 90 }],
      masteryThreshold: MASTERY.threshold,
    });

    expect(learnerA).not.toEqual(learnerB);
    expect(learnerA.masteredNotions).toBe(1);
    expect(learnerB.masteredNotions).toBe(0);
    expect(learnerA.completedMinutes).toBe(60);
    expect(learnerB.completedMinutes).toBe(0);
    expect(learnerAAgain).toEqual(learnerA);
  });

  it('applique une surcharge de paramètres sans muter la configuration', () => {
    const override = withParams('retention', { horizonsDays: [60] });
    const result = calculateRetention({
      modules: [{ moduleId: 'm1', validatedAt: VALIDATION, notionIds: ['n1'] }],
      reviews: [{ reviewId: 'r1', notionId: 'n1', reviewedAt: REVIEW, correct: true }],
      at: AT,
      timeZone: TZ,
      params: {
        horizonsDays: override.horizonsDays,
        toleranceDays: override.toleranceDays,
      },
    });
    expect(result.map((item) => item.horizonDays)).toEqual([60]);
    expect(result[0]?.rate).toBeNull();
    expect(ENGINE.retention.horizonsDays).toEqual([30, 60]);

    const strictMastery = withParams('mastery', { threshold: 90 });
    const progress = calculateProgress({
      modules: [{ moduleId: 'm1', status: 'validated' }],
      slots: [],
      notionStates: [{ notionId: 'n1', mastery: 89 }],
      masteryThreshold: strictMastery.threshold,
    });
    expect(progress.masteredNotions).toBe(0);
  });
});
