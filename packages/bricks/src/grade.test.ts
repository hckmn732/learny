import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { BrickType } from './brick-types';
import { brickExamples } from './examples';
import { gradeBrick, clampTutorScore } from './grade';
import { clampScore, dedupeConfusions, round2, round4, zodGradeIssues } from './grade-support';

const CHOICE = brickExamples.choice_question.valid;
const SEED = '99999999-9999-4999-8999-999999999999';

describe('[SPEC-502] correction par le code', () => {
  it('dirige chaque type auto-corrigé vers son correcteur', () => {
    const responses: Record<string, unknown> = {
      choice_question: { optionIds: ['a'] },
      cloze: { gaps: { '1': 'produits', '2': 'charges', '3': 'résultat' } },
      matching: { pairs: { a: null, b: null, c: null } },
      ordering: { order: ['a', 'b', 'c'] },
      categorization: { assignments: { a: null, b: null, c: null, d: null } },
      recall_card: { selfGrade: 'good' },
    };
    for (const [type, response] of Object.entries(responses)) {
      const example = brickExamples[type as keyof typeof brickExamples];
      const graded = gradeBrick(type as BrickType, example.valid, response, SEED);
      expect(graded.ok, type).toBe(true);
    }
  });

  it('refuse les trois types corrigés par le tuteur (CL-12, BR-BRI-08)', () => {
    for (const type of ['open_question', 'instruction', 'scripted_dialogue'] as const) {
      const graded = gradeBrick(type, brickExamples[type].valid, {}, SEED);
      expect(graded.ok).toBe(false);
      if (!graded.ok) {
        expect(graded.error.code).toBe('GRADED_BY_TUTOR');
        expect(graded.error.issues[0]?.path).toBe('type');
      }
    }
  });

  it('refuse un type sans correction par le code', () => {
    for (const type of ['text', 'timer', 'scoring'] as const) {
      const graded = gradeBrick(type, brickExamples[type].valid, {}, SEED);
      expect(graded.ok).toBe(false);
      if (!graded.ok) expect(graded.error.code).toBe('RESPONSE_INVALID');
    }
  });

  it('propage une réponse invalide', () => {
    const graded = gradeBrick('choice_question', CHOICE, { optionIds: [] }, SEED);
    expect(graded.ok).toBe(false);
    if (!graded.ok) expect(graded.error.code).toBe('RESPONSE_INVALID');
  });
});

describe('[SPEC-502] note du tuteur', () => {
  it('borne une note au barème et arrondit à 2 décimales (CL-10)', () => {
    expect(clampTutorScore(12, 10)).toBe(10);
    expect(clampTutorScore(-1, 10)).toBe(0);
    expect(clampTutorScore(6.666, 10)).toBe(6.67);
    expect(clampTutorScore(0, 0)).toBe(0);
  });

  it('refuse NaN et un barème négatif avec RESPONSE_INVALID (CL-10)', () => {
    for (const call of [
      () => clampTutorScore(Number.NaN, 10),
      () => clampTutorScore(5, Number.POSITIVE_INFINITY),
      () => clampTutorScore(5, -1),
    ]) {
      expect(call).toThrow(AppError);
      try {
        call();
      } catch (error) {
        expect((error as AppError).code).toBe('RESPONSE_INVALID');
        expect((error as AppError).status).toBeUndefined();
      }
    }
  });
});

describe('[SPEC-502] performance de la correction', () => {
  it('corrige 1 000 briques en moins de 200 ms, p95 sous 1 ms (ET-7)', () => {
    for (let index = 0; index < 50; index += 1) {
      gradeBrick('choice_question', CHOICE, { optionIds: ['a'] }, SEED);
    }
    const durations: number[] = [];
    const start = performance.now();
    for (let index = 0; index < 1000; index += 1) {
      const callStart = performance.now();
      const graded = gradeBrick('choice_question', CHOICE, { optionIds: ['a'] }, SEED);
      durations.push(performance.now() - callStart);
      expect(graded.ok).toBe(true);
    }
    const total = performance.now() - start;
    const sorted = [...durations].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? 0;
    expect(total).toBeLessThan(200);
    expect(p95).toBeLessThan(1);
  });
});

describe('[SPEC-502] utilitaires de correction', () => {
  it('arrondit demi vers le haut', () => {
    expect(round4(1 / 3)).toBe(0.3333);
    expect(round4(2 / 3)).toBe(0.6667);
    expect(round2(1.005)).toBe(1.01);
  });

  it('borne un ratio', () => {
    expect(clampScore(-1)).toBe(0);
    expect(clampScore(2)).toBe(1);
    expect(clampScore(Number.NaN)).toBe(0);
  });

  it('dédoublonne les confusions en gardant l’ordre', () => {
    expect(
      dedupeConfusions([
        { notionId: 'a', confusedWithNotionId: 'b' },
        { notionId: 'a', confusedWithNotionId: 'b' },
        { notionId: 'a', confusedWithNotionId: 'c' },
      ]),
    ).toEqual([
      { notionId: 'a', confusedWithNotionId: 'b' },
      { notionId: 'a', confusedWithNotionId: 'c' },
    ]);
  });

  it('convertit les issues Zod en chemins lisibles', () => {
    const parsed = z.object({ a: z.string() }).safeParse({});
    if (parsed.success) throw new Error('Le schéma aurait dû échouer');
    const issues = zodGradeIssues(parsed.error);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('response.a');
    expect(typeof issues[0]?.message).toBe('string');
  });
});
