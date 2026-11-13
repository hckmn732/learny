// Unit tests of the review filter of the mock exam (SPEC-614 EF-4, BR-PRA-04). Pure helpers:
// « toutes » keeps every row, « erreurs » keeps wrong or unanswered questions, and the counters
// displayed next to the filters both agree.

import { describe, expect, it } from 'vitest';

import type { ExamReviewRow } from '@learny/contracts';

import { countExamReview, filterExamReview } from './review';

const ROWS: ExamReviewRow[] = [
  {
    position: 1,
    brickVersionId: '11111111-1111-4111-8111-111111111111',
    typeLabel: 'Choix unique',
    question: 'Question 1',
    notionLabel: 'Notion 1',
    modulePosition: 1,
    moduleLabel: 'Module 1',
    studied: true,
    isCorrect: true,
    given: 'Bonne réponse',
    expected: null,
    explanation: 'Explication.',
  },
  {
    position: 2,
    brickVersionId: '22222222-2222-4222-8222-222222222222',
    typeLabel: 'Texte à trous',
    question: 'Question 2',
    notionLabel: 'Notion 2',
    modulePosition: 2,
    moduleLabel: 'Module 2',
    studied: false,
    isCorrect: false,
    given: 'sans réponse',
    expected: 'Réponse attendue',
    explanation: null,
  },
];

describe('[SPEC-614] revue de l’examen blanc', () => {
  it('BR-PRA-04 — « toutes » renvoie une copie de chaque ligne', () => {
    const rows = filterExamReview(ROWS, 'all');
    expect(rows).toEqual(ROWS);
    expect(rows).not.toBe(ROWS);
  });

  it('BR-PRA-04 — « erreurs » ne garde que les questions fausses ou sans réponse', () => {
    expect(filterExamReview(ROWS, 'errors')).toEqual([ROWS[1]]);
  });

  it('compte les deux filtres', () => {
    expect(countExamReview(ROWS)).toEqual({ all: 2, errors: 1 });
    expect(countExamReview([])).toEqual({ all: 0, errors: 0 });
  });
});
