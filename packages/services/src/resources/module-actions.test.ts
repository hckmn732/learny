// Unit tests of the module actions of SPEC-607: rename a contribution and request the course
// generation now. The transaction is a fake: these tests pin the RLS refusal, the optimistic
// conflict, the idempotent rename and the locked-module guard, not SQL.

import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { generateCourseNow } from './generate';
import { renameResource } from './rename';

vi.mock('@learny/jobs', () => ({
  emitAfterCommit: vi.fn().mockResolvedValue(undefined),
}));

const USER = '11111111-1111-4111-8111-111111111111';
const RESOURCE = '22222222-2222-4222-8222-222222222222';
const MODULE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-module-actions',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: RESOURCE,
    title: 'Note initiale',
    status: 'ready',
    updated_at: NOW,
    ...overrides,
  };
}

describe('[SPEC-607] actions du module', () => {
  it('refuse un apport étranger sans révéler son existence (ET-1)', async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await expect(
      renameResource(context(execute), RESOURCE, { title: 'Nouveau titre' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('refuse une version périmée avec le titre actuel (CL-2)', async () => {
    const execute = vi.fn().mockResolvedValue([row()]);

    await expect(
      renameResource(context(execute), RESOURCE, {
        title: 'Nouveau titre',
        expectedUpdatedAt: '2026-11-10T10:00:00.000Z',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('renomme sans écrire quand le titre est déjà le bon (BR-APP-10)', async () => {
    const execute = vi.fn().mockResolvedValue([row()]);

    await expect(
      renameResource(context(execute), RESOURCE, { title: 'Note initiale' }),
    ).resolves.toMatchObject({
      ok: true,
      value: { id: RESOURCE, title: 'Note initiale', status: 'ready' },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('renomme et restitue la nouvelle version (BR-APP-10)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([row({ title: 'Nouveau titre', updated_at: NOW })]);

    await expect(
      renameResource(context(execute), RESOURCE, { title: 'Nouveau titre' }),
    ).resolves.toMatchObject({
      ok: true,
      value: { title: 'Nouveau titre', updatedAt: NOW.toISOString() },
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('refuse la génération d’un module introuvable ou verrouillé (ET-2, CL-2)', async () => {
    await expect(
      generateCourseNow(context(vi.fn().mockResolvedValue([])), MODULE),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const locked = vi.fn().mockResolvedValue([
      {
        module_id: MODULE,
        module_status: 'locked',
        chapters_total: 2,
        chapters_done: 0,
        resource_count: 0,
      },
    ]);
    await expect(generateCourseNow(context(locked), MODULE)).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('demande la génération forcée d’un module ouvert (EF-4)', async () => {
    const execute = vi.fn().mockResolvedValue([
      {
        module_id: MODULE,
        module_status: 'open',
        chapters_total: 2,
        chapters_done: 1,
        resource_count: 3,
      },
    ]);

    await expect(generateCourseNow(context(execute), MODULE)).resolves.toEqual({
      ok: true,
      value: { moduleId: MODULE, requested: true },
    });
  });
});
