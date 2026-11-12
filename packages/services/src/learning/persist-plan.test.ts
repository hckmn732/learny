// Unit tests of the idempotent plan persistence (SPEC-411 EF-4, ET-3). The transaction is a fake:
// these tests pin the reconciliation counts, the preserved rows and the validation, not SQL.
import { describe, expect, it, vi } from 'vitest';

import type { PlannedSlot } from '@learny/learning-engine';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { persistPlan } from './persist-plan';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MODULE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-11T12:20:00Z');

function slot(partial: Partial<PlannedSlot> & Pick<PlannedSlot, 'slotId'>): PlannedSlot {
  return {
    formationId: FORMATION,
    moduleId: MODULE,
    kind: 'revision',
    title: 'Réviser',
    startsAt: '2026-11-12T09:00:00+01:00',
    endsAt: '2026-11-12T09:30:00+01:00',
    status: 'planned',
    createdBy: 'planner',
    movedFromId: null,
    ...partial,
  };
}

function context(execute: ReturnType<typeof vi.fn>, insert = vi.fn(), update = vi.fn()) {
  const tx = {
    execute,
    insert: insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    update: update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
  };
  const db = { run: (flow: (inner: unknown) => Promise<unknown>) => flow(tx) } as never;
  const ctx: ServiceContext = {
    userId: USER,
    requestId: 'req-plan',
    db: db,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
  return { ctx, tx, insert, update };
}

describe('[SPEC-411] persistance du plan', () => {
  it('crée, met à jour, conserve et annule les créneaux selon la révision (EF-4)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: FORMATION }])
      .mockResolvedValueOnce([
        {
          id: 'slot-keep',
          planner_key: 'keep',
          kind: 'revision',
          title: 'Réviser',
          module_id: MODULE,
          starts_at: '2026-11-12T08:00:00.000Z',
          ends_at: '2026-11-12T08:30:00.000Z',
          status: 'planned',
          created_by: 'planner',
        },
        {
          id: 'slot-update',
          planner_key: 'update',
          kind: 'revision',
          title: 'Ancien',
          module_id: MODULE,
          starts_at: '2026-11-12T10:00:00.000Z',
          ends_at: '2026-11-12T10:30:00.000Z',
          status: 'planned',
          created_by: 'planner',
        },
        {
          id: 'slot-done',
          planner_key: 'done',
          kind: 'revision',
          title: 'Fait',
          module_id: MODULE,
          starts_at: '2026-11-12T11:00:00.000Z',
          ends_at: '2026-11-12T11:30:00.000Z',
          status: 'done',
          created_by: 'planner',
        },
      ]);
    const { ctx, insert, update } = context(execute);

    const result = await persistPlan(
      ctx,
      FORMATION,
      [
        slot({ slotId: 'keep', title: 'Réviser' }),
        slot({ slotId: 'update', title: 'Nouveau' }),
        slot({ slotId: 'done' }),
        slot({ slotId: 'new' }),
        slot({ slotId: 'past', startsAt: '2026-11-10T09:00:00+01:00' }),
      ],
      'rev-1',
    );

    expect(result).toEqual({
      ok: true,
      value: {
        formationId: FORMATION,
        revisionKey: 'rev-1',
        created: 1,
        updated: 1,
        unchanged: 1,
        cancelled: 0,
        preserved: 1,
      },
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('annule les créneaux planifiés futurs absents de la nouvelle révision', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: FORMATION }])
      .mockResolvedValueOnce([
        {
          id: 'slot-gone',
          planner_key: 'gone',
          kind: 'revision',
          title: 'À annuler',
          module_id: MODULE,
          starts_at: '2026-11-12T09:00:00.000Z',
          ends_at: '2026-11-12T09:30:00.000Z',
          status: 'planned',
          created_by: 'planner',
        },
        {
          id: 'slot-learner',
          planner_key: 'learner',
          kind: 'revision',
          title: 'Manuel',
          module_id: MODULE,
          starts_at: '2026-11-12T10:00:00.000Z',
          ends_at: '2026-11-12T10:30:00.000Z',
          status: 'planned',
          created_by: 'learner',
        },
      ]);
    const { ctx, update } = context(execute);

    const result = await persistPlan(ctx, FORMATION, [], 'rev-2');

    expect(result).toMatchObject({
      ok: true,
      value: { created: 0, updated: 0, unchanged: 0, cancelled: 1, preserved: 0 },
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('refuse une formation absente et les entrées invalides', async () => {
    const missing = await persistPlan(
      context(vi.fn().mockResolvedValue([])).ctx,
      FORMATION,
      [],
      'rev-3',
    );
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const invalid = await persistPlan(
      context(vi.fn().mockResolvedValue([])).ctx,
      'pas-un-uuid',
      [],
      'rev-3',
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });
});
