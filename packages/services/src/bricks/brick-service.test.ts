// Unit tests of the brick lifecycle service (SPEC-501 ET-8). The transaction is a fake: these
// tests pin validation, version conflicts, report idempotence and the public payload boundary.
import { describe, expect, it, vi } from 'vitest';

import { brickExamples } from '@learny/bricks';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import {
  createBrick,
  createBrickVersion,
  getPublicBrick,
  reportBrick,
  retireBrick,
} from './brick-service';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const BRICK = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const NOTION = '55555555-5555-4555-8555-555555555555';

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-bricks',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as never,
    clock: new TestClock('2026-11-11T12:20:00Z'),
    logger: {} as never,
  };
}

function row(partial: Record<string, unknown> = {}) {
  return {
    id: BRICK,
    type: 'text',
    notionIds: [NOTION],
    purpose: 'course',
    status: 'active',
    currentVersion: 1,
    formationId: FORMATION,
    origin: 'tutor',
    ...partial,
  };
}

const draft = {
  type: 'text' as const,
  formationId: FORMATION,
  purpose: 'course' as const,
  notionIds: [NOTION],
  origin: 'tutor' as const,
  payload: brickExamples.text.valid,
};

describe('[SPEC-501] cycle de vie des briques', () => {
  it('crée une brique validée et sa version 1 (EF-1)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ id: FORMATION }])
      .mockResolvedValueOnce([{ id: NOTION }])
      .mockResolvedValueOnce([{ id: BRICK }])
      .mockResolvedValueOnce([{ id: VERSION }]);

    const result = await createBrick(context(execute), { ...draft, createdBy: 'tutor' });

    expect(result).toMatchObject({
      ok: true,
      value: { brickId: BRICK, versionId: VERSION, version: 1 },
    });
  });

  it('refuse une formation absente et une charge invalide', async () => {
    const missing = await createBrick(context(vi.fn().mockResolvedValue([])), {
      ...draft,
      createdBy: 'tutor',
    });
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const invalid = await createBrick(
      context(
        vi
          .fn()
          .mockResolvedValueOnce([{ id: FORMATION }])
          .mockResolvedValueOnce([{ id: NOTION }]),
      ),
      {
        ...draft,
        createdBy: 'tutor',
        payload: brickExamples.text.invalid,
      },
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: 'BRICK_INVALID' } });
  });

  it('crée la version suivante puis résout les signalements (EF-2, EF-4)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([{ id: NOTION }])
      .mockResolvedValueOnce([{ id: VERSION }])
      .mockResolvedValueOnce([{ id: BRICK }])
      .mockResolvedValueOnce([]);

    const result = await createBrickVersion(context(execute), BRICK, {
      payload: brickExamples.text.valid,
      expectedVersion: 1,
      createdBy: 'learner',
    });

    expect(result).toMatchObject({ ok: true, value: { brickId: BRICK, version: 2 } });
  });

  it('refuse une brique absente, retirée ou une version obsolète', async () => {
    const missing = await createBrickVersion(context(vi.fn().mockResolvedValue([])), BRICK, {
      payload: brickExamples.text.valid,
      expectedVersion: 1,
      createdBy: 'learner',
    });
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const retired = await createBrickVersion(
      context(vi.fn().mockResolvedValueOnce([row({ status: 'retired' })])),
      BRICK,
      { payload: brickExamples.text.valid, expectedVersion: 1, createdBy: 'learner' },
    );
    expect(retired).toMatchObject({ ok: false, error: { code: 'BRICK_RETIRED' } });

    const stale = await createBrickVersion(
      context(vi.fn().mockResolvedValueOnce([row({ currentVersion: 3 })])),
      BRICK,
      { payload: brickExamples.text.valid, expectedVersion: 1, createdBy: 'learner' },
    );
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('signale une brique une seule fois et la retire des tirages (EF-3)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: VERSION }])
      .mockResolvedValueOnce([{ id: VERSION }])
      .mockResolvedValueOnce([]);

    const result = await reportBrick(context(execute), BRICK, { reason: 'Réponse fausse.' });
    expect(result).toMatchObject({
      ok: true,
      value: { reportId: VERSION, status: 'open', created: true },
    });

    const existing = await reportBrick(
      context(
        vi
          .fn()
          .mockResolvedValueOnce([row()])
          .mockResolvedValueOnce([{ id: VERSION }]),
      ),
      BRICK,
      { reason: 'Déjà signalée.' },
    );
    expect(existing).toMatchObject({ ok: true, value: { created: false } });
  });

  it('retire une brique et expose sa charge publique (EF-6, EF-7)', async () => {
    const retired = await retireBrick(
      context(vi.fn().mockResolvedValueOnce([{ id: BRICK }])),
      BRICK,
    );
    expect(retired).toEqual({ ok: true, value: undefined });

    const publicBrick = await getPublicBrick(
      context(
        vi.fn().mockResolvedValueOnce([
          {
            brickId: BRICK,
            versionId: VERSION,
            type: 'text',
            notionIds: [NOTION],
            payload: brickExamples.text.valid,
          },
        ]),
      ),
      VERSION,
    );
    expect(publicBrick).toMatchObject({ ok: true, value: { brickId: BRICK, versionId: VERSION } });

    const absent = await getPublicBrick(context(vi.fn().mockResolvedValueOnce([])), VERSION);
    expect(absent).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
