// Unit tests of the reading progress service (SPEC-609 EF-3, ET-5, BR-COU-08). The transaction and
// the outbox are fakes: these tests pin the monotone write, the single event, the stored timestamp
// and the chapter/course percentages.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { silentLogger, TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { readProgressByChapter, recordCourseProgress } from './progress';

const mocks = vi.hoisted(() => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  })),
  outboxAdd: vi.fn(),
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
vi.mock('@learny/db', () => ({ sql: mocks.sql }));

const USER = '11111111-1111-4111-8111-111111111111';
const COURSE = '22222222-2222-4222-8222-222222222222';
const MODULE = '33333333-3333-4333-8333-333333333333';
const CHAPTER = '44444444-4444-4444-8444-444444444444';
const SECTION_1 = '55555555-5555-4555-8555-555555555555';
const SECTION_2 = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>, userId: string | null = USER): ServiceContext {
  return {
    userId,
    requestId: 'req-progress',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: silentLogger(),
  };
}

function sequence(rows: readonly unknown[][]): ReturnType<typeof vi.fn> {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

function courseRow() {
  return { id: COURSE, module_id: MODULE };
}

beforeEach(() => {
  mocks.outboxAdd.mockReset();
});

describe('[SPEC-609] service de progression de lecture', () => {
  it('refuse un appel non authentifié', async () => {
    await expect(
      recordCourseProgress(context(vi.fn(), null), COURSE, {
        chapterId: CHAPTER,
        visibleSectionIds: [],
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('refuse un identifiant de cours invalide', async () => {
    await expect(
      recordCourseProgress(context(vi.fn()), 'pas-un-uuid', {
        chapterId: CHAPTER,
        visibleSectionIds: [],
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('refuse un identifiant de chapitre ou de section invalide', async () => {
    await expect(
      recordCourseProgress(context(vi.fn()), COURSE, {
        chapterId: 'pas-un-uuid',
        visibleSectionIds: [],
      }),
    ).rejects.toThrow();
    await expect(
      recordCourseProgress(context(vi.fn()), COURSE, {
        chapterId: CHAPTER,
        visibleSectionIds: ['pas-un-uuid'],
      }),
    ).rejects.toThrow();
  });

  it('rend 404 un cours absent ou étranger', async () => {
    const execute = sequence([[], []]);

    await expect(
      recordCourseProgress(context(execute), COURSE, {
        chapterId: CHAPTER,
        visibleSectionIds: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', detail: 'Cours introuvable.' },
    });
  });

  it('rend 404 un chapitre hors du module', async () => {
    const execute = sequence([[], [courseRow()], []]);

    await expect(
      recordCourseProgress(context(execute), COURSE, {
        chapterId: CHAPTER,
        visibleSectionIds: [],
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', detail: 'Chapitre introuvable.' },
    });
  });

  it('enregistre une progression d’un coup et émet un seul événement (CA-2)', async () => {
    const execute = sequence([
      [],
      [courseRow()],
      [{ id: CHAPTER, total: 2, percent: 0, updated_at: null }],
      [{ id: SECTION_1 }, { id: SECTION_2 }],
      [],
    ]);

    await expect(
      recordCourseProgress(context(execute), COURSE, {
        chapterId: CHAPTER,
        visibleSectionIds: [SECTION_1, SECTION_2],
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        chapterPercent: 100,
        coursePercent: 100,
        updatedAt: NOW.toISOString(),
      },
    });
    expect(mocks.outboxAdd).toHaveBeenCalledWith(
      'course/progress-updated',
      { userId: USER, courseId: COURSE, chapterId: CHAPTER, percent: 100 },
      { id: `course-progress:${COURSE}:${CHAPTER}:100` },
    );
  });

  it('ne fait jamais reculer la progression et garde l’horodatage lu (BR-COU-08)', async () => {
    const execute = sequence([
      [],
      [courseRow()],
      [{ id: CHAPTER, total: 2, percent: 80, updated_at: NOW }],
      [{ id: SECTION_1 }, { id: SECTION_2 }],
    ]);

    await expect(
      recordCourseProgress(context(execute), COURSE, {
        chapterId: CHAPTER,
        visibleSectionIds: [SECTION_1],
      }),
    ).resolves.toEqual({
      ok: true,
      value: { chapterPercent: 80, coursePercent: 80, updatedAt: NOW.toISOString() },
    });
    expect(mocks.outboxAdd).not.toHaveBeenCalled();
  });

  it('ignore les sections inconnues et rend un horodatage nul sans mesure', async () => {
    const execute = sequence([
      [],
      [courseRow()],
      [{ id: CHAPTER, total: 0, percent: null, updated_at: null }],
      [],
    ]);

    await expect(
      recordCourseProgress(context(execute), COURSE, {
        chapterId: CHAPTER,
        visibleSectionIds: [],
      }),
    ).resolves.toEqual({
      ok: true,
      value: { chapterPercent: 0, coursePercent: 0, updatedAt: null },
    });
  });

  it('lit les pourcentages persistés indexés par chapitre', async () => {
    const execute = vi.fn().mockResolvedValue([{ chapter_id: CHAPTER, percent: 60 }]);

    const map = await readProgressByChapter({ execute } as never, USER, COURSE);

    expect(map.get(CHAPTER)).toBe(60);
  });
});
