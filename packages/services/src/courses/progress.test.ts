// Unit tests of the reading progress rules (SPEC-609 §12): 0/60/40/100 %, monotonicity and the
// 200 words per minute estimate. The HTTP and RLS path is covered by the integration suite.

import { describe, expect, it } from 'vitest';

import {
  coursePercent,
  estimateReadingMinutes,
  mergeProgress,
  readingPercent,
} from './progress';

describe('[SPEC-609] progression de lecture', () => {
  it('CA-2 — calcule 0, 60, 40 et 100 % depuis les sections visibles', () => {
    expect(readingPercent(0, 5)).toBe(0);
    expect(readingPercent(3, 5)).toBe(60);
    expect(readingPercent(2, 5)).toBe(40);
    expect(readingPercent(5, 5)).toBe(100);
    expect(readingPercent(9, 5)).toBe(100);
    expect(readingPercent(1, 0)).toBe(0);
  });

  it('CA-2 — la progression ne recule jamais', () => {
    expect(mergeProgress(60, 40)).toBe(60);
    expect(mergeProgress(60, 100)).toBe(100);
    expect(mergeProgress(0, 60)).toBe(60);
  });

  it('BR-COU-08 — la progression du cours est la moyenne des chapitres lus', () => {
    expect(coursePercent([60, 0, 100, 0])).toBe(40);
    expect(coursePercent([])).toBe(0);
  });

  it('BR-COU-11 — estime le temps de lecture à 200 mots par minute', () => {
    expect(estimateReadingMinutes(0)).toBe(1);
    expect(estimateReadingMinutes(200)).toBe(1);
    expect(estimateReadingMinutes(201)).toBe(2);
    expect(estimateReadingMinutes(1000)).toBe(5);
  });
});
