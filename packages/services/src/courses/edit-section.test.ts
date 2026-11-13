// Unit tests of the section correction (SPEC-609 EF-4, ET-2, ET-4, CL-2, BR-COU-09). The
// transaction, the outbox and the clock are fakes: these tests pin optimistic concurrency, the
// idempotent replay, the no-op read and the brick reactivation.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { silentLogger, TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { editCourseSection } from './edit-section';

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
const FORMATION = '33333333-3333-4333-8333-333333333333';
const CHAPTER = '44444444-4444-4444-8444-444444444444';
const SECTION = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-edit',
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

function sectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SECTION,
    course_id: COURSE,
    formation_id: FORMATION,
    chapter_id: CHAPTER,
    version: 1,
    title: 'Titre',
    content_md: 'Contenu',
    reported: false,
    updated_at: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.outboxAdd.mockReset();
});

describe('[SPEC-609] correction d’une section', () => {
  it('refuse un identifiant de section invalide', async () => {
    await expect(
      editCourseSection(context(vi.fn()), 'pas-un-uuid', { expectedVersion: 1, contentMd: 'x' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('refuse un corps vide (au moins un champ requis)', async () => {
    await expect(
      editCourseSection(context(vi.fn()), SECTION, { expectedVersion: 1 }),
    ).rejects.toThrow();
  });

  it('refuse une clé de demande invalide', async () => {
    await expect(
      editCourseSection(context(vi.fn()), SECTION, {
        expectedVersion: 1,
        contentMd: 'x',
        requestKey: 'court',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('rend 404 une section étrangère ou absente (ET-4)', async () => {
    const execute = sequence([[], []]);

    await expect(
      editCourseSection(context(execute), SECTION, { expectedVersion: 1, contentMd: 'x' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('rend 409 avec la version actuelle quand la lecture est périmée (CL-2)', async () => {
    const execute = sequence([[], [sectionRow({ version: 3 })]]);

    const result = await editCourseSection(context(execute), SECTION, {
      expectedVersion: 2,
      contentMd: 'x',
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        detail: 'La section a changé depuis votre lecture.',
        errors: [{ path: 'expectedVersion', message: 'Version actuelle : 3.' }],
      },
    });
  });

  it('ne réécrit rien quand le contenu est identique et la section saine', async () => {
    const execute = sequence([[], [sectionRow()]]);

    await expect(
      editCourseSection(context(execute), SECTION, { expectedVersion: 1, contentMd: 'Contenu' }),
    ).resolves.toMatchObject({
      ok: true,
      value: { sectionId: SECTION, version: 1, reported: false },
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(mocks.outboxAdd).not.toHaveBeenCalled();
  });

  it('corrige, résout les signalements et réactive les briques (CA-3, CA-4)', async () => {
    const updated = sectionRow({ version: 2, title: 'Titre corrigé', content_md: 'Nouveau' });
    const execute = sequence([
      [],
      [],
      [sectionRow()],
      [],
      [],
      [updated],
      [{ affected_brick_ids: ['brick-1', 7] }],
      [],
    ]);

    await expect(
      editCourseSection(context(execute), SECTION, {
        expectedVersion: 1,
        title: 'Titre corrigé',
        contentMd: 'Nouveau',
        requestKey: 'edit-key-0001',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { sectionId: SECTION, version: 2, title: 'Titre corrigé', reported: false },
    });
    expect(mocks.outboxAdd).toHaveBeenCalledWith(
      'course/section-edited',
      { userId: USER, courseId: COURSE, sectionId: SECTION, version: 2 },
      { id: `course-section-edited:${SECTION}:2` },
    );
  });

  it('lève le signalement même sans changement de contenu (CL-2)', async () => {
    const updated = sectionRow({ version: 2, reported: false });
    const execute = sequence([[], [sectionRow({ reported: true })], [], [], [updated], []]);

    await expect(
      editCourseSection(context(execute), SECTION, { expectedVersion: 1, contentMd: 'Contenu' }),
    ).resolves.toMatchObject({ ok: true, value: { reported: false } });
    expect(mocks.outboxAdd).toHaveBeenCalledTimes(1);
  });

  it('rejoue une correction déjà enregistrée sans nouvelle écriture (ET-2)', async () => {
    const execute = sequence([[], [{ id: SECTION }], [sectionRow({ version: 2 })]]);

    await expect(
      editCourseSection(context(execute), SECTION, {
        expectedVersion: 1,
        contentMd: 'Nouveau',
        requestKey: 'edit-key-0001',
      }),
    ).resolves.toMatchObject({ ok: true, value: { sectionId: SECTION, version: 2 } });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(mocks.outboxAdd).not.toHaveBeenCalled();
  });

  it('rend 404 si le rejeu ne retrouve plus la section', async () => {
    const execute = sequence([[], [{ id: SECTION }], []]);

    await expect(
      editCourseSection(context(execute), SECTION, {
        expectedVersion: 1,
        contentMd: 'Nouveau',
        requestKey: 'edit-key-0001',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('rend 404 si la section disparaît entre l’écriture et la relecture', async () => {
    const execute = sequence([[], [sectionRow()], [], [], []]);

    await expect(
      editCourseSection(context(execute), SECTION, { expectedVersion: 1, contentMd: 'Nouveau' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
