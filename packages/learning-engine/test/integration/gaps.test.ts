import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';
import {
  DEFAULT_GAP_PARAMS,
  applyReview,
  calculateMastery,
  clearGap,
  createNotionCard,
  detectGap,
  gradeReview,
  normalizeError,
} from '@learny/learning-engine';
import type { AnswerRecord, GapAttempt, GapParams, MasteryAnswer } from '@learny/learning-engine';
import { REFERENCE_NOW } from '@learny/learning-engine/fixtures';
import { buildAnswer, buildGap } from '@learny/learning-engine/fixtures/builders';

const NOTION = 'n-s4';
const NOW = REFERENCE_NOW;
const PARAMS: GapParams = {
  ...ENGINE.gaps,
  masteryThreshold: ENGINE.mastery.threshold,
};

function recorded(partial: Partial<AnswerRecord> = {}): AnswerRecord {
  return buildAnswer({
    notionIds: [NOTION],
    countsForGaps: true,
    ...partial,
  });
}

function masteryOf(answers: readonly AnswerRecord[], at = NOW): number {
  const points: MasteryAnswer[] = answers
    .filter((answer) => answer.score !== null && answer.maxScore !== null && answer.maxScore > 0)
    .map((answer) => ({
      answerId: answer.answerId,
      attemptId: answer.attemptId,
      score: (answer.score ?? 0) / (answer.maxScore ?? 1),
      answeredAt: answer.answeredAt,
    }));
  return calculateMastery({
    answers: points,
    at,
    threshold: ENGINE.mastery.threshold,
    halfLifeDays: ENGINE.mastery.halfLifeDays,
  }).mastery;
}

function attempt(
  attemptId: string,
  attemptKind: GapAttempt['attemptKind'],
  answers: readonly AnswerRecord[],
): GapAttempt {
  return {
    attemptId,
    attemptKind,
    answers: answers.map((answer) => ({ ...answer, attemptId, attemptKind })),
  };
}

describe('[SPEC-404] composition', () => {
  it('reflète les paramètres normatifs du moteur (CA-1, CA-4)', () => {
    expect(DEFAULT_GAP_PARAMS).toEqual(PARAMS);
    expect(DEFAULT_GAP_PARAMS).toMatchObject({
      failureRatio: ENGINE.gaps.failureRatio,
      forgettingMinDays: ENGINE.gaps.forgettingMinDays,
      repeatedErrorAttempts: ENGINE.gaps.repeatedErrorAttempts,
      clearSuccesses: ENGINE.gaps.clearSuccesses,
      clearMinDaysApart: ENGINE.gaps.clearMinDaysApart,
      masteryThreshold: ENGINE.mastery.threshold,
    });
  });

  it('compose la maîtrise calculée et la détection (CA-1, CA-3)', () => {
    const failed = recorded({
      answerId: 'a-fail',
      attemptId: 'attempt-quiz',
      attemptKind: 'validation_quiz',
      correct: false,
      score: 0,
      maxScore: 1,
      answeredAt: NOW,
      chosenDistractorNotionId: 'n-type',
    });
    const mastery = masteryOf([failed]);
    expect(mastery).toBe(0);

    const detection = detectGap({
      notion: NOTION,
      attempts: [attempt('attempt-quiz', 'validation_quiz', [failed])],
      mastery,
      now: NOW,
      params: PARAMS,
    });
    expect(detection.active).toBe(true);
    expect(detection.event).toBe('detected');
    expect(detection.nature).toBe('confusion');
    expect(detection.confusedWith).toBe('n-type');
    expect(detection.recommendedAction).toBe('confrontation');

    const successful = recorded({
      answerId: 'a-good',
      attemptId: 'attempt-ok',
      correct: true,
      score: 1,
      maxScore: 1,
      answeredAt: NOW,
    });
    const notDetected = detectGap({
      notion: NOTION,
      attempts: [attempt('attempt-ok', 'validation_quiz', [successful])],
      mastery: masteryOf([successful]),
      now: NOW,
      params: PARAMS,
    });
    expect(notDetected.active).toBe(false);
  });

  it('compose un lapse FSRS et la nature oubli (CA-3)', () => {
    const card = createNotionCard('2026-10-01T12:20:00.000Z', ENGINE.fsrs.requestRetention);
    const decision = gradeReview({
      correct: false,
      timeMs: 20_000,
      format: 'choice_question',
      settings: ENGINE.fsrs,
    });
    expect(decision.rating).toBe('again');
    const reviewed = applyReview(
      card,
      decision.rating ?? 'again',
      '2026-10-01T12:20:00.000Z',
      ENGINE.fsrs.requestRetention,
    );
    expect(reviewed.card.reps).toBe(1);

    const failed = recorded({
      answerId: 'a-lapse',
      attemptId: 'attempt-lapse',
      correct: false,
      score: 0,
      maxScore: 1,
      answeredAt: NOW,
    });
    const detection = detectGap({
      notion: NOTION,
      attempts: [attempt('attempt-lapse', 'validation_quiz', [failed])],
      mastery: 40,
      now: NOW,
      existingGap: null,
      fsrsLapsed: true,
      params: PARAMS,
    });
    expect(detection.active).toBe(true);
    expect(detection.nature).toBe('forgetting');
    expect(detection.recommendedAction).toBe('global_quiz');
  });

  it('compose la répétition d’erreur normalisée sur deux tentatives (CA-2)', () => {
    const first = recorded({
      answerId: 'a-1',
      attemptId: 'attempt-1',
      attemptKind: 'global_quiz_session',
      correct: false,
      format: 'open_question',
      normalizedResponse: 'Théorème de Pythagore',
      score: 0,
      maxScore: 1,
      answeredAt: '2026-11-10T12:20:00.000Z',
    });
    const second = recorded({
      answerId: 'a-2',
      attemptId: 'attempt-2',
      attemptKind: 'global_quiz_session',
      correct: false,
      format: 'open_question',
      normalizedResponse: 'theoreme  de pythagore',
      score: 0,
      maxScore: 1,
      answeredAt: NOW,
    });
    expect(normalizeError(first.normalizedResponse ?? '')).toBe(
      normalizeError(second.normalizedResponse ?? ''),
    );
    const detection = detectGap({
      notion: NOTION,
      attempts: [
        attempt('attempt-1', 'global_quiz_session', [first]),
        attempt('attempt-2', 'global_quiz_session', [second]),
      ],
      mastery: 90,
      now: NOW,
      params: PARAMS,
    });
    expect(detection.active).toBe(true);
    expect(detection.triggers).toEqual(['repeated_error']);
    expect(detection.repeatedErrors).toEqual([
      { key: 'response:theoreme de pythagore', attemptIds: ['attempt-1', 'attempt-2'] },
    ]);

    const bothInOne = detectGap({
      notion: NOTION,
      attempts: [
        attempt('attempt-1', 'global_quiz_session', [
          first,
          { ...second, answerId: 'a-1-bis', attemptId: 'attempt-1' },
        ]),
      ],
      mastery: 90,
      now: NOW,
      params: PARAMS,
    });
    expect(bothInOne.active).toBe(false);
  });

  it('compose la levée avec des réussites du moteur et le seuil (CA-4)', () => {
    const gap = buildGap({
      nature: 'forgetting',
      confusedWith: null,
      detectedAt: '2026-11-01T12:20:00.000Z',
      evidence: 'Détection de composition.',
    });
    const first = recorded({
      answerId: 'a-clear-1',
      attemptId: 'attempt-clear-1',
      correct: true,
      score: 1,
      maxScore: 1,
      answeredAt: '2026-11-10T12:20:00.000Z',
      source: 'warmup',
      attemptKind: 'warmup',
      countsForGaps: false,
    });
    const second = recorded({
      answerId: 'a-clear-2',
      attemptId: 'attempt-clear-2',
      correct: true,
      score: 1,
      maxScore: 1,
      answeredAt: NOW,
      source: 'global_quiz',
      attemptKind: 'global_quiz_session',
    });
    const mastery = masteryOf([first, second]);
    expect(mastery).toBeGreaterThanOrEqual(ENGINE.mastery.threshold);

    const clearance = clearGap({
      gap,
      successes: [first, second],
      mastery,
      now: NOW,
      notion: NOTION,
      params: PARAMS,
    });
    expect(clearance.cleared).toBe(true);
    expect(clearance.event).toBe('cleared');
    expect(clearance.gap?.clearedAt).toBe(NOW);
    expect(clearance.successCount).toBe(2);

    const tooShort = clearGap({
      gap,
      successes: [first, { ...second, answeredAt: '2026-11-11T12:19:59.999Z' }],
      mastery,
      now: NOW,
      notion: NOTION,
      params: PARAMS,
    });
    expect(tooShort.cleared).toBe(false);
    expect(tooShort.checks.spaced).toBe(false);
  });

  it('reste invariant à la répétition et à l’ordre des entrées (CA-3, CA-4)', () => {
    const attempts = [
      attempt('attempt-1', 'validation_quiz', [
        recorded({
          answerId: 'a-1',
          attemptId: 'attempt-1',
          correct: false,
          chosenDistractorNotionId: 'n-type',
          answeredAt: '2026-11-10T12:20:00.000Z',
        }),
      ]),
      attempt('attempt-2', 'exercise', [
        recorded({
          answerId: 'a-2',
          attemptId: 'attempt-2',
          correct: false,
          answeredAt: NOW,
        }),
      ]),
    ];
    const first = detectGap({
      notion: NOTION,
      attempts,
      mastery: 30,
      now: NOW,
      params: PARAMS,
    });
    const frozen = JSON.stringify(attempts);
    expect(detectGap({ notion: NOTION, attempts, mastery: 30, now: NOW, params: PARAMS })).toEqual(
      first,
    );
    expect(
      detectGap({
        notion: NOTION,
        attempts: [...attempts].reverse(),
        mastery: 30,
        now: NOW,
        params: PARAMS,
      }),
    ).toEqual(first);
    expect(JSON.stringify(attempts)).toBe(frozen);

    const gap = buildGap({
      nature: 'forgetting',
      confusedWith: null,
      detectedAt: '2026-11-01T12:20:00.000Z',
    });
    const successes = [
      recorded({
        answerId: 's-1',
        correct: true,
        score: 1,
        maxScore: 1,
        answeredAt: '2026-11-02T12:20:00.000Z',
      }),
      recorded({ answerId: 's-2', correct: true, score: 1, maxScore: 1, answeredAt: NOW }),
    ];
    const reference = clearGap({
      gap,
      successes,
      mastery: 100,
      now: NOW,
      notion: NOTION,
      params: PARAMS,
    });
    expect(
      clearGap({
        gap,
        successes: [...successes].reverse(),
        mastery: 100,
        now: NOW,
        notion: NOTION,
        params: PARAMS,
      }),
    ).toEqual(reference);
    expect(reference.cleared).toBe(true);
  });

  it('garde le module de lacunes pur, sans configuration, horloge ni I/O (ET-4)', () => {
    const root = fileURLToPath(new URL('../../src/gaps', import.meta.url));
    for (const file of ['detect.ts', 'normalize-error.ts', 'index.ts']) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(source).not.toMatch(/from\s+['"]@learny\/config/u);
      expect(source).not.toMatch(/\bDate\.now\s*\(/u);
      expect(source).not.toMatch(/new Date\(\s*\)/u);
      expect(source).not.toMatch(/\bfetch\s*\(/u);
    }
  });
});
