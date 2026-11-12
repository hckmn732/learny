import { describe, expect, it, vi } from 'vitest';

import { SidebarUpdateInput } from '@learny/contracts';

import { TestClock } from '../test/support/fakes';

import type { ServiceContext } from './context';
import { formationMonogram, getSidebar, lastCivilDays, shiftCivilDay } from './sidebar';

describe('[SPEC-304] Coquille : menu latéral — dérivations', () => {
  it('calcule le sigle de repli d’une formation (ADR-0162)', () => {
    expect(formationMonogram('SAP S/4HANA Finance')).toBe('SA');
    expect(formationMonogram('Gestion de projet agile')).toBe('GE');
    expect(formationMonogram('Éco-conception')).toBe('EC');
    expect(formationMonogram('Python')).toBe('PY');
    expect(formationMonogram('')).toBe('?');
    expect(formationMonogram('é')).toBe('E');
  });

  it('construit les 14 jours civils se terminant aujourd’hui, du plus ancien au plus récent', () => {
    expect(shiftCivilDay('2026-11-11', -1)).toBe('2026-11-10');
    expect(shiftCivilDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftCivilDay('2026-12-31', 1)).toBe('2027-01-01');
    const days = lastCivilDays('2026-11-11');
    expect(days).toHaveLength(14);
    expect(days[0]).toBe('2026-10-29');
    expect(days[13]).toBe('2026-11-11');
    expect(days).toEqual([...days].sort());
  });

  it('exige au moins une préférence dans la mise à jour du menu (ET-3)', () => {
    expect(SidebarUpdateInput.safeParse({ collapsed: true }).success).toBe(true);
    expect(SidebarUpdateInput.safeParse({ collapsed: false }).success).toBe(true);
    expect(
      SidebarUpdateInput.safeParse({ currentFormationId: '11111111-1111-4111-8111-111111111111' })
        .success,
    ).toBe(true);
    expect(SidebarUpdateInput.safeParse({}).success).toBe(false);
    expect(SidebarUpdateInput.safeParse({ currentFormationId: 'pas-un-uuid' }).success).toBe(false);
  });

  it('assemble le menu depuis la formation courante et la régularité (ET-1, ET-3)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        {
          current_formation_id: 'f1',
          sidebar_collapsed: true,
          timezone: 'Europe/Paris',
          streak_days: 4,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'f1',
          title: 'SAP S/4HANA Finance',
          status: 'active',
          module_count: 4,
          validated_count: 1,
          open_position: 3,
        },
        {
          id: 'f2',
          title: 'Gestion de projet agile',
          status: 'paused',
          module_count: 2,
          validated_count: 0,
          open_position: null,
        },
      ])
      .mockResolvedValueOnce([{ due_count: 2, gap_count: 1 }])
      .mockResolvedValueOnce([{ day: '2026-11-10', minutes: 12, qualifying: false }]);

    const ctx: ServiceContext = {
      userId: '11111111-1111-4111-8111-111111111111',
      requestId: 'req-sidebar',
      db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as never,
      clock: new TestClock(),
      logger: {} as never,
    };

    const result = await getSidebar(ctx);

    expect(result).toMatchObject({
      ok: true,
      value: {
        collapsed: true,
        currentFormation: {
          id: 'f1',
          monogram: 'SA',
          progressPercent: 25,
          currentModulePosition: 3,
        },
        formations: [
          { id: 'f1', status: 'active' },
          { id: 'f2', status: 'paused' },
        ],
        quizDueCount: 2,
        gapCount: 1,
        streak: { days: 4 },
      },
    });
    if (!result.ok) throw new Error('sidebar should succeed');
    expect(result.value.streak.regularity).toHaveLength(14);
    expect(result.value.streak.regularity[12]).toEqual({ date: '2026-11-10', status: 'done' });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('retombe sur la première formation active quand la courante est inaccessible (ET-1)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        {
          current_formation_id: 'absent',
          sidebar_collapsed: false,
          timezone: 'UTC',
          streak_days: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'f2',
          title: 'Python',
          status: 'active',
          module_count: 0,
          validated_count: 0,
          open_position: null,
        },
      ])
      .mockResolvedValueOnce([{ due_count: 0, gap_count: 0 }])
      .mockResolvedValueOnce([]);

    const ctx: ServiceContext = {
      userId: '11111111-1111-4111-8111-111111111111',
      requestId: 'req-sidebar',
      db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as never,
      clock: new TestClock(),
      logger: {} as never,
    };

    const result = await getSidebar(ctx);
    if (!result.ok) throw new Error('sidebar should succeed');
    expect(result.value.currentFormation).toMatchObject({ id: 'f2', progressPercent: 0 });
  });
});
