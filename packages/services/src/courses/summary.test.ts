// Unit tests of the chapter summary (SPEC-609 EF-3, ET-2 to ET-5, BR-COU-07, CL-4). The tutor,
// the owner-role client, the transaction and the outbox are fakes: these tests pin the commit
// before the model call, the deferred draft, the idempotent replay and the stored feedback.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';
import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { submitChapterSummary } from './summary';

const mocks = vi.hoisted(() => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  })),
  outboxAdd: vi.fn(),
  serviceDb: vi.fn(() => ({ execute: vi.fn() })),
  correct: vi.fn(),
  warn: vi.fn(),
  withTransaction: vi.fn(
    async (
      database: {
        run: (
          fn: (tx: unknown, outbox: { add: typeof mocks.outboxAdd }) => Promise<unknown>,
        ) => Promise<unknown>;
      },
      fn: (tx: unknown, outbox: { add: typeof mocks.outboxAdd }) => Promise<unknown>,
    ) => database.run((tx) => fn(tx, { add: mocks.outboxAdd })),
  ),
}));

vi.mock('@learny/jobs', () => ({ withTransaction: mocks.withTransaction }));
vi.mock('@learny/db', () => ({ sql: mocks.sql, serviceDb: mocks.serviceDb }));
vi.mock('@learny/tutor', () => ({ correctChapterSummary: mocks.correct }));

const USER = '11111111-1111-4111-8111-111111111111';
const COURSE = '22222222-2222-4222-8222-222222222222';
const FORMATION = '33333333-3333-4333-8333-333333333333';
const MODULE = '44444444-4444-4444-8444-444444444444';
const CHAPTER = '55555555-5555-4555-8555-555555555555';
const SUMMARY = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-11-11T12:20:00Z');
const FEEDBACK = {
  verdict: 'partial' as const,
  message: 'Il manque la clé 50.',
  missing: ['La clé 50 crédite.'],
};

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-summary',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: { warn: mocks.warn } as never,
  };
}

function sequence(rows: readonly unknown[][]): ReturnType<typeof vi.fn> {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

function courseRow() {
  return { id: COURSE, module_id: MODULE, formation_id: FORMATION };
}

function summaryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SUMMARY,
    chapter_id: CHAPTER,
    course_id: COURSE,
    text: 'Une pièce a un en-tête.',
    feedback: null,
    created_at: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.outboxAdd.mockReset();
  mocks.correct.mockReset();
  mocks.warn.mockReset();
  mocks.serviceDb.mockClear();
});

describe('[SPEC-609] résumé de chapitre', () => {
  it('refuse un identifiant de chapitre invalide', async () => {
    await expect(
      submitChapterSummary(context(vi.fn()), 'pas-un-uuid', { courseId: COURSE, text: 'x' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('refuse un texte vide ou un cours invalide', async () => {
    await expect(
      submitChapterSummary(context(vi.fn()), CHAPTER, { courseId: COURSE, text: '   ' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('refuse une clé de demande invalide', async () => {
    await expect(
      submitChapterSummary(context(vi.fn()), CHAPTER, {
        courseId: COURSE,
        text: 'Résumé',
        requestKey: 'court',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('rend 404 un cours absent ou non prêt', async () => {
    const execute = sequence([[], []]);

    await expect(
      submitChapterSummary(context(execute), CHAPTER, { courseId: COURSE, text: 'Résumé' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('rend 404 un chapitre hors du module', async () => {
    const execute = sequence([[], [courseRow()], []]);

    await expect(
      submitChapterSummary(context(execute), CHAPTER, { courseId: COURSE, text: 'Résumé' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('rend une erreur interne si l’insertion ne rend pas de ligne', async () => {
    const execute = sequence([[], [courseRow()], [{ id: CHAPTER, title: 'Titre' }], []]);

    await expect(
      submitChapterSummary(context(execute), CHAPTER, { courseId: COURSE, text: 'Résumé' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });

  it('enregistre le texte, le corrige et émet une fois (CA-4)', async () => {
    const execute = sequence([
      [],
      [],
      [courseRow()],
      [{ id: CHAPTER, title: 'Saisie' }],
      [summaryRow()],
      [{ data: { points: ['La clé 40 débite', 'La clé 50 crédite', 7] } }],
      [],
    ]);
    mocks.correct.mockResolvedValue({ ok: true, value: FEEDBACK });

    await expect(
      submitChapterSummary(context(execute), CHAPTER, {
        courseId: COURSE,
        text: 'Une pièce a un en-tête.',
        requestKey: 'summary-key-0001',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        id: SUMMARY,
        chapterId: CHAPTER,
        courseId: COURSE,
        status: 'corrected',
        feedback: FEEDBACK,
        createdAt: NOW.toISOString(),
      },
    });
    expect(mocks.correct).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        formationId: FORMATION,
        requestId: 'req-summary',
        llmDb: expect.anything() as unknown,
      }),
      {
        text: 'Une pièce a un en-tête.',
        chapterTitle: 'Saisie',
        keyPoints: ['La clé 40 débite', 'La clé 50 crédite'],
      },
    );
    expect(mocks.outboxAdd).toHaveBeenCalledWith(
      'course/summary-submitted',
      {
        userId: USER,
        courseId: COURSE,
        chapterId: CHAPTER,
        summaryId: SUMMARY,
        corrected: true,
      },
      { id: `course-summary:${SUMMARY}` },
    );
  });

  it('garde le texte en brouillon quand le tuteur décline (CL-4)', async () => {
    const execute = sequence([
      [],
      [courseRow()],
      [{ id: CHAPTER, title: 'Saisie' }],
      [summaryRow()],
      [{ data: null }],
    ]);
    mocks.correct.mockResolvedValue({
      ok: false,
      error: new AppError('AI_UNAVAILABLE', 'Indisponible.'),
    });

    await expect(
      submitChapterSummary(context(execute), CHAPTER, {
        courseId: COURSE,
        text: 'Une pièce a un en-tête.',
      }),
    ).resolves.toMatchObject({ ok: true, value: { status: 'deferred', feedback: null } });
    expect(mocks.warn).toHaveBeenCalledWith(
      'summary correction deferred',
      expect.objectContaining({ code: 'AI_UNAVAILABLE' }),
    );
    expect(mocks.outboxAdd).toHaveBeenCalledWith(
      'course/summary-submitted',
      expect.objectContaining({ corrected: false }),
      { id: `course-summary:${SUMMARY}` },
    );
  });

  it('garde le texte en brouillon quand le tuteur lève une AppError', async () => {
    const execute = sequence([
      [],
      [courseRow()],
      [{ id: CHAPTER, title: 'Saisie' }],
      [summaryRow()],
      [{ data: { points: 'pas un tableau' } }],
    ]);
    mocks.correct.mockRejectedValue(new AppError('SERVICE_UNAVAILABLE', 'Indisponible.'));

    await expect(
      submitChapterSummary(context(execute), CHAPTER, {
        courseId: COURSE,
        text: 'Une pièce a un en-tête.',
      }),
    ).resolves.toMatchObject({ ok: true, value: { status: 'deferred' } });
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });

  it('propage un défaut non applicatif du tuteur', async () => {
    const execute = sequence([
      [],
      [courseRow()],
      [{ id: CHAPTER, title: 'Saisie' }],
      [summaryRow()],
      [{ data: null }],
    ]);
    mocks.correct.mockRejectedValue(new Error('bug'));

    await expect(
      submitChapterSummary(context(execute), CHAPTER, {
        courseId: COURSE,
        text: 'Une pièce a un en-tête.',
      }),
    ).rejects.toThrow('bug');
  });

  it('rejoue le premier résumé sans second appel au tuteur ni événement (ET-2)', async () => {
    const execute = sequence([[], [{ ...summaryRow(), feedback: FEEDBACK }]]);

    await expect(
      submitChapterSummary(context(execute), CHAPTER, {
        courseId: COURSE,
        text: 'Texte rejoué.',
        requestKey: 'summary-key-0001',
      }),
    ).resolves.toMatchObject({ ok: true, value: { id: SUMMARY, status: 'corrected' } });
    expect(mocks.correct).not.toHaveBeenCalled();
    expect(mocks.outboxAdd).not.toHaveBeenCalled();
  });

  it('dégrade un retour illisible en brouillon au rejeu', async () => {
    const execute = sequence([[], [{ ...summaryRow(), feedback: { verdict: 'inconnu' } }]]);

    await expect(
      submitChapterSummary(context(execute), CHAPTER, {
        courseId: COURSE,
        text: 'Texte rejoué.',
        requestKey: 'summary-key-0001',
      }),
    ).resolves.toMatchObject({ ok: true, value: { status: 'deferred', feedback: null } });
  });
});
