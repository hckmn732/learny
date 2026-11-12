import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';
import {
  applyReview,
  buildDailySession,
  createNotionCard,
  detectGap,
} from '@learny/learning-engine';
import type {
  BuildDailySessionInput,
  GapNature,
  GlobalQuizBank,
  GlobalQuizDueNotion,
  GlobalQuizLastFormat,
  SerializedFsrsCard,
} from '@learny/learning-engine';
import { REFERENCE_NOW } from '@learny/learning-engine/fixtures';
import { buildAnswer } from '@learny/learning-engine/fixtures/builders';

const DATE = '2026-11-11';
const SEED = 'composition-406';
const RETENTION = ENGINE.fsrs.requestRetention;
const PARAMS = ENGINE.globalQuiz;
const GAP_PARAMS = {
  ...ENGINE.gaps,
  masteryThreshold: ENGINE.mastery.threshold,
};

interface ComposedNotion {
  due: GlobalQuizDueNotion;
  card: SerializedFsrsCard;
}

/** FSRS card of one notion, reviewed as failed so its next due date is the applied card's due. */
function reviewedNotion(
  notionId: string,
  moduleId: string,
  modulePosition: number,
  overrides: Partial<GlobalQuizDueNotion> = {},
): ComposedNotion {
  const card = createNotionCard(REFERENCE_NOW, RETENTION);
  const applied = applyReview(card, 'again', REFERENCE_NOW, RETENTION);
  return {
    card: applied.card,
    due: {
      notionId,
      moduleId,
      modulePosition,
      moduleStatus: 'validated',
      evaluated: true,
      dueAt: applied.dueAt,
      ...overrides,
    },
  };
}

function confusionGap(notionId: string): GapNature {
  const failed = buildAnswer({
    answerId: `answer-${notionId}`,
    attemptId: `attempt-${notionId}`,
    notionIds: [notionId],
    correct: false,
    score: 0,
    maxScore: 1,
    chosenDistractorNotionId: 'n-other',
    answeredAt: REFERENCE_NOW,
  });
  const detection = detectGap({
    notion: notionId,
    attempts: [
      {
        attemptId: `attempt-${notionId}`,
        attemptKind: 'validation_quiz',
        answers: [failed],
      },
    ],
    mastery: 0,
    now: REFERENCE_NOW,
    params: GAP_PARAMS,
  });
  expect(detection.active).toBe(true);
  expect(detection.nature).toBe('confusion');
  return detection.nature ?? 'misunderstanding';
}

function bank(notionId: string, formats: GlobalQuizBank['formats']): GlobalQuizBank {
  return { notionId, formats };
}

function last(notionId: string, format: GlobalQuizLastFormat['format']): GlobalQuizLastFormat {
  return { notionId, format };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function composedInput(): BuildDailySessionInput {
  const a = reviewedNotion('a', 'm1', 1);
  const b = reviewedNotion('b', 'm1', 1);
  const c = reviewedNotion('c', 'm2', 2);
  const d = reviewedNotion('d', 'm3', 3);
  return {
    formationId: 'sap',
    date: DATE,
    dueNotions: [a.due, b.due, c.due, d.due],
    gaps: [{ notionId: 'a', nature: confusionGap('a') }],
    bank: [
      bank('a', ['choice_question', 'matching', 'categorization']),
      bank('b', ['choice_question', 'cloze']),
      bank('c', ['recall_card', 'choice_question']),
      bank('d', ['open_question', 'cloze']),
    ],
    lastFormats: [last('a', 'matching'), last('b', 'choice_question'), last('c', 'recall_card')],
    capMinutes: 3,
    mode: 'full',
    seed: SEED,
    params: PARAMS,
  };
}

describe('[SPEC-406] composition', () => {
  it('compose FSRS, lacunes et banque sans altérer les états reportés (CA-2 à CA-4)', () => {
    const input = deepFreeze(composedInput());
    const cards = input.dueNotions.map(
      (_notion, index) => reviewedNotion(`card-${String(index)}`, 'm1', 1).card,
    );
    const frozenCards = structuredClone(cards);

    const result = buildDailySession(input);

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.estimatedMinutes).toBeLessThanOrEqual(result.capMinutes);
    expect(result.items[0]?.notionId).toBe('a');
    expect(result.items[0]?.selectionReason).toBe('gap');
    expect(result.items[0]?.gapNature).toBe('confusion');
    expect(result.items.some((item) => item.format !== 'matching')).toBe(true);

    const deferred = result.deferred.map((entry) => entry.notionId);
    expect(deferred.length).toBeGreaterThan(0);
    for (const entry of result.deferred) {
      const source = input.dueNotions.find((notion) => notion.notionId === entry.notionId);
      expect(entry.dueAt).toBe(source?.dueAt);
    }
    // FSRS cards are only read through `dueAt`: no session computation rewrites them.
    expect(cards).toEqual(frozenCards);
  });

  it('reste invariant à la répétition et à l’ordre des entrées, à seed égale (CA-2 à CA-4)', () => {
    const input = composedInput();
    const first = buildDailySession(input);
    for (let index = 0; index < 5; index += 1) {
      expect(buildDailySession(input)).toEqual(first);
    }

    const permuted = buildDailySession({
      ...input,
      dueNotions: [...input.dueNotions].reverse(),
      bank: [...input.bank].reverse(),
      lastFormats: [...input.lastFormats].reverse(),
    });
    expect(permuted).toEqual(first);

    const otherSeed = buildDailySession({ ...input, seed: 'other-seed' });
    expect(otherSeed.items.map((item) => item.notionId)).toEqual(
      first.items.map((item) => item.notionId),
    );
    expect(otherSeed.estimatedMinutes).toBe(first.estimatedMinutes);
  });

  it('mode entretien : cinq minutes au plus et modules validés seulement (CA-4)', () => {
    const validated = reviewedNotion('validated', 'm1', 1);
    const current = reviewedNotion('current', 'm2', 2, {
      moduleStatus: 'open',
      evaluated: true,
    });
    const input: BuildDailySessionInput = {
      formationId: 'sap',
      date: DATE,
      dueNotions: [validated.due, current.due],
      gaps: [],
      bank: [bank('validated', ['choice_question']), bank('current', ['choice_question'])],
      lastFormats: [],
      capMinutes: 15,
      mode: 'maintenance',
      seed: SEED,
      params: PARAMS,
    };

    const result = buildDailySession(input);
    expect(result.requestedCapMinutes).toBe(15);
    expect(result.capMinutes).toBe(PARAMS.maintenanceMaxMinutes);
    expect(result.estimatedMinutes).toBeLessThanOrEqual(5);
    expect(result.items.map((item) => item.notionId)).toEqual(['validated']);
    expect(result.deferred).toContainEqual(
      expect.objectContaining({ notionId: 'current', reason: 'maintenance_validated_only' }),
    );
  });
});
