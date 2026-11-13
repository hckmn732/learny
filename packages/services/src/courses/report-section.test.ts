// Unit tests of the section report (SPEC-609 EF-4, ET-2, ET-4, BR-COU-09, BR-MEM-09). The
// transaction, the outbox and the brick suspension are fakes: these tests pin the 404, the single
// open report, the idempotent replay and the suspension of the notions' bank bricks.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { silentLogger, TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { reportCourseSection } from './report-section';

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
const SECTION = '44444444-4444-4444-8444-444444444444';
const REPORT = '55555555-5555-4555-8555-555555555555';
const NOTION = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-report',
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
    notion_ids: [NOTION],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.outboxAdd.mockReset();
});

describe('[SPEC-609] signalement d’une section', () => {
  it('refuse un identifiant de section invalide', async () => {
    await expect(
      reportCourseSection(context(vi.fn()), 'pas-un-uuid', { reason: 'Faux' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('refuse un motif vide', async () => {
    await expect(
      reportCourseSection(context(vi.fn()), SECTION, { reason: '   ' }),
    ).rejects.toThrow();
  });

  it('refuse une clé de demande invalide', async () => {
    await expect(
      reportCourseSection(context(vi.fn()), SECTION, {
        reason: 'Faux',
        requestKey: 'court',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('rejoue un signalement déjà enregistré (ET-2)', async () => {
    const execute = sequence([[], [{ id: REPORT, section_id: SECTION, created_at: NOW }]]);

    await expect(
      reportCourseSection(context(execute), SECTION, {
        reason: 'Faux',
        requestKey: 'report-key-0001',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { reportId: REPORT, sectionId: SECTION, status: 'open', reported: true },
    });
    expect(mocks.outboxAdd).not.toHaveBeenCalled();
  });

  it('renvoie le signalement déjà ouvert sans doublon ni nouvel événement (BR-COU-09)', async () => {
    const execute = sequence([[], [{ id: REPORT, created_at: NOW }]]);

    await expect(
      reportCourseSection(context(execute), SECTION, { reason: 'Faux' }),
    ).resolves.toMatchObject({ ok: true, value: { reportId: REPORT, sectionId: SECTION } });
    expect(mocks.outboxAdd).not.toHaveBeenCalled();
  });

  it('rend 404 une section étrangère ou absente', async () => {
    const execute = sequence([[], [], []]);

    await expect(
      reportCourseSection(context(execute), SECTION, { reason: 'Faux' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('signale, suspend les briques des notions et émet un seul événement (CA-3)', async () => {
    const execute = sequence([
      [],
      [],
      [],
      [sectionRow()],
      [{ id: 'brick-1' }],
      [],
      [],
      [{ id: REPORT, created_at: NOW }],
    ]);

    await expect(
      reportCourseSection(context(execute), SECTION, {
        reason: 'Le passage est faux.',
        requestKey: 'report-key-0001',
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: { reportId: REPORT, sectionId: SECTION, status: 'open', reported: true },
    });
    expect(mocks.outboxAdd).toHaveBeenCalledWith(
      'course/section-reported',
      { userId: USER, courseId: COURSE, sectionId: SECTION, reportId: REPORT },
      { id: `course-section-reported:${REPORT}` },
    );
  });

  it('accepte un tableau Postgres textuel de notions et un signalement absent', async () => {
    const execute = sequence([[], [], [sectionRow({ notion_ids: `{${NOTION}}` })], [], [], []]);

    await expect(
      reportCourseSection(context(execute), SECTION, { reason: 'Faux' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });

  it('ignore des notions illisibles et rend une erreur interne sans identifiant rendu', async () => {
    const execute = sequence([[], [], [sectionRow({ notion_ids: 42 })], [], []]);

    await expect(
      reportCourseSection(context(execute), SECTION, { reason: 'Faux' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });
});
