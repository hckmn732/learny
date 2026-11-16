// Unit rules of the capped and smoothed global quiz (SPEC-718, BR-AUT-07).
//
// The draw is pure (ADR-0020): these tests never touch the database or the process clock. They
// pin the six admitted settings, the default 15 min / 90 %, the gap-first order, the explicit
// deferral reason and the idempotent reopening used after « Annuler le lissage ».
import { describe, expect, it } from 'vitest';

import { ENGINE, MEMORY_RULES } from '@learny/config/product';
import { PlafondQuizParams } from '@learny/contracts';
import {
  drawSmoothQuizSession,
  reintroduceDeferredNotions,
  type BrickFormat,
  type BuildDailySessionInput,
  type GlobalQuizBank,
} from '@learny/learning-engine';

const DATE = '2026-11-11';
const NOW = '2026-11-10T08:00:00.000Z';

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function notion(index: number) {
  return {
    notionId: uuid(index),
    moduleId: uuid(10_000 + index),
    modulePosition: (index % 3) + 1,
    moduleStatus: 'validated' as const,
    evaluated: true,
    dueAt: NOW,
  };
}

const FORMATS: readonly BrickFormat[] = [
  'choice_question',
  'recall_card',
  'matching',
  'categorization',
  'cloze',
  'ordering',
];

function bank(index: number): GlobalQuizBank {
  return { notionId: uuid(index), formats: [...FORMATS] };
}

type SmoothingInput = Omit<BuildDailySessionInput, 'capMinutes' | 'targetRetention'> & {
  maxMinutes: number;
  targetRetention: number;
};

function input(
  overrides: Partial<Omit<BuildDailySessionInput, 'capMinutes' | 'targetRetention'>> & {
    maxMinutes?: number;
    targetRetention?: number;
  } = {},
): SmoothingInput {
  return {
    formationId: uuid(99_999),
    date: DATE,
    dueNotions: [],
    gaps: [],
    bank: [],
    lastFormats: [],
    seed: 'spec-718',
    mode: 'full',
    params: {
      notionCostSec: ENGINE.globalQuiz.notionCostSec,
      sessionOverheadSec: ENGINE.globalQuiz.sessionOverheadSec,
      formatSeconds: ENGINE.globalQuiz.formatSeconds,
      maintenanceMaxMinutes: ENGINE.globalQuiz.maintenanceMaxMinutes,
    },
    maxMinutes: MEMORY_RULES.dailyReviewMaxMinutes,
    targetRetention: MEMORY_RULES.retentionTargetPercent / 100,
    ...overrides,
  };
}

describe('[SPEC-718] règles et calculs', () => {
  it('CA-1 — 15 min et 90 % par défaut, seuls les six choix autorisés', () => {
    expect(PlafondQuizParams.parse({})).toEqual({ maxMinutes: 15, targetRetention: 0.9 });
    expect(MEMORY_RULES.dailyReviewMaxMinutes).toBe(15);
    expect(MEMORY_RULES.retentionTargetPercent).toBe(90);

    for (const maxMinutes of [10, 15, 20, 30] as const) {
      for (const targetRetention of [0.85, 0.9, 0.95] as const) {
        expect(PlafondQuizParams.safeParse({ maxMinutes, targetRetention }).success).toBe(true);
      }
    }
    for (const maxMinutes of [5, 12, 25, 60]) {
      expect(PlafondQuizParams.safeParse({ maxMinutes }).success).toBe(false);
    }
    for (const targetRetention of [0.8, 0.88, 1]) {
      expect(PlafondQuizParams.safeParse({ targetRetention }).success).toBe(false);
    }
  });

  it('CA-2 — les lacunes restent en tête et le dépassement est reporté sans révision écrite', () => {
    const dueNotions = Array.from({ length: 40 }, (_, index) => notion(index + 1));
    const gapId = uuid(1);
    const result = drawSmoothQuizSession(
      input({
        dueNotions,
        gaps: [{ notionId: gapId, nature: 'forgetting' }],
        bank: Array.from({ length: 40 }, (_, index) => bank(index + 1)),
      }),
    );

    expect(result.selected[0]).toBe(gapId);
    expect(result.deferred.length).toBeGreaterThan(0);
    expect(result.deferredReason).toBe('cap');
    expect(result.deferred.every((entry) => entry.reason === 'cap')).toBe(true);
    expect(result.estimatedMinutes).toBeLessThanOrEqual(result.maxMinutes);
    expect(result.targetRetention).toBe(0.9);
    expect(result.selected.length + result.deferred.length).toBe(40);
  });

  it('CA-2 — Annuler le lissage réintroduit chaque notion une seule fois', () => {
    const current = [uuid(1), uuid(2)];
    const deferred = [uuid(2), uuid(3), uuid(4)];
    const once = reintroduceDeferredNotions(current, deferred);
    expect(once).toEqual([uuid(1), uuid(2), uuid(3), uuid(4)]);
    expect(reintroduceDeferredNotions(once, deferred)).toEqual(once);
  });

  it('CL-3 — aucune notion due : aucun report, aucune bannière', () => {
    const result = drawSmoothQuizSession(input());
    expect(result.selected).toEqual([]);
    expect(result.deferred).toEqual([]);
    expect(result.estimatedMinutes).toBe(0);
    expect(result.deferredReason).toBeNull();
  });

  it('CL-4 — lacunes seules au-delà du plafond : elles restent prioritaires et le report est expliqué', () => {
    const dueNotions = Array.from({ length: 40 }, (_, index) => notion(index + 1));
    const result = drawSmoothQuizSession(
      input({
        dueNotions,
        gaps: dueNotions.map((entry) => ({
          notionId: entry.notionId,
          nature: 'confusion' as const,
        })),
        bank: Array.from({ length: 40 }, (_, index) => bank(index + 1)),
        maxMinutes: 10,
      }),
    );
    expect(result.selected.length).toBeGreaterThan(0);
    expect(
      result.selected.every((notionId) => dueNotions.some((entry) => entry.notionId === notionId)),
    ).toBe(true);
    expect(result.deferred.length).toBe(40 - result.selected.length);
    expect(result.deferredReason).toBe('cap');
  });

  it('ordre déterministe : même entrée, même tirage', () => {
    const dueNotions = Array.from({ length: 8 }, (_, index) => notion(index + 1));
    const value = input({
      dueNotions,
      bank: Array.from({ length: 8 }, (_, index) => bank(index + 1)),
      maxMinutes: 3,
    });
    expect(drawSmoothQuizSession(value)).toEqual(drawSmoothQuizSession(value));
  });
});
