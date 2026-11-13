// Unit tests of the course read model (SPEC-608 EF-1 to EF-5). The transaction is a fake: these
// tests pin the 404 for a foreign module, the empty generation states and the minimal ready course.

import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { getModuleCourse } from './get-course';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MODULE = '33333333-3333-4333-8333-333333333333';
const CHAPTER = '44444444-4444-4444-8444-444444444444';
const COURSE = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-course',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

function sequence(rows: readonly unknown[][]): ReturnType<typeof vi.fn> {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

function moduleRow() {
  return {
    formation_id: FORMATION,
    formation_title: 'SAP S/4HANA Finance',
    module_id: MODULE,
    module_title: 'Comptabilité générale',
    module_position: 3,
    modules_total: 7,
    threshold: 80,
  };
}

function chapterRow() {
  return { id: CHAPTER, position: 1, title: 'Plan comptable' };
}

function courseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COURSE,
    version: 2,
    status: 'ready',
    model: 'mock',
    error: null,
    created_at: NOW,
    ...overrides,
  };
}

describe('[SPEC-608] lecture du cours', () => {
  it('refuse un module étranger sans révéler son existence (ET-1)', async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await expect(getModuleCourse(context(execute), MODULE)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', detail: 'Module introuvable.' },
    });
  });

  it('refuse un module sans chapitre', async () => {
    const execute = sequence([[moduleRow()], []]);

    await expect(getModuleCourse(context(execute), MODULE)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', detail: 'Aucun chapitre dans ce module.' },
    });
  });

  it('rend un module sans génération en cours (EF-1, EF-5)', async () => {
    const execute = sequence([[moduleRow()], [chapterRow()], [], []]);

    await expect(getModuleCourse(context(execute), MODULE)).resolves.toMatchObject({
      ok: true,
      value: {
        module: { id: MODULE, position: 3, positionTotal: 7 },
        selectedChapterId: CHAPTER,
        course: null,
        generation: { status: 'none', version: null, error: null },
      },
    });
  });

  it('rend un cours prêt minimal, sans section ni ressource (BR-COU-03)', async () => {
    const execute = sequence([
      [moduleRow()],
      [chapterRow()],
      [courseRow()],
      [courseRow()],
      [{ chapter_id: CHAPTER, total: 0 }],
      [],
      [],
      [{ total: 0 }],
      [],
      [],
      [],
    ]);

    await expect(getModuleCourse(context(execute), MODULE)).resolves.toMatchObject({
      ok: true,
      value: {
        course: {
          id: COURSE,
          version: 2,
          status: 'ready',
          readingMinutes: 1,
          resourceCount: 0,
          baseCourse: true,
          chapter: { id: CHAPTER, hasCourse: false },
          sections: [],
          suggestions: [],
        },
        generation: { status: 'ready', version: 2, error: null },
      },
    });
  });
});
