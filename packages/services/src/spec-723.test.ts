import { describe, expect, it, vi } from 'vitest';

import { TestClock } from '../test/support/fakes';

import type { ServiceContext } from './context';
import { getStreak } from './serie-regularite-et-jalons-interface';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';

const SEED_DAYS = [
  '2026-10-31',
  '2026-11-01',
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
];

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-spec-723',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as never,
    clock: new TestClock(),
    logger: {} as never,
  };
}

/** The seven reads of `readSeriesContext`, in call order, for the 12-day seed of SPEC-115. */
function seedReads(execute: ReturnType<typeof vi.fn>, withModule = false): void {
  execute
    .mockResolvedValueOnce([
      { timezone: 'Europe/Paris', current_formation_id: withModule ? FORMATION : null },
    ])
    .mockResolvedValueOnce([{ study_days: [1, 2, 3, 4, 5] }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(SEED_DAYS.map((day) => ({ day, minutes: 60, qualifying: true })))
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ count: 0 }]);
  if (withModule) {
    execute.mockResolvedValueOnce([{ id: 'module-1', title: 'Comptabilité générale' }]);
  }
  execute.mockResolvedValueOnce([]);
}

describe('[SPEC-723] règles et calculs', () => {
  it('CA-1 — GET /streak du seed du 11 novembre : 12 jours et exactement 14 cases', async () => {
    const execute = vi.fn();
    seedReads(execute);

    const result = await getStreak(context(execute));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      days: 12,
      timezone: 'Europe/Paris',
      computedOn: '2026-11-11',
    });
    expect(result.value.regularity).toHaveLength(14);
    expect(result.value.regularity[0]).toEqual({ date: '2026-10-29', status: 'none' });
    expect(result.value.regularity.at(-1)).toEqual({ date: '2026-11-11', status: 'done' });
    expect(result.value.regularity.filter((day) => day.status === 'done')).toHaveLength(12);
    expect(result.value.nextMilestone).toMatchObject({ kind: 'streak_30', remaining: 18 });
    expect(execute).toHaveBeenCalledTimes(7);
  });

  it('CA-2 — le prochain jalon préfère un module ouvert, sans classement', async () => {
    const execute = vi.fn();
    seedReads(execute, true);

    const result = await getStreak(context(execute));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nextMilestone).toEqual({
      kind: 'module_validated',
      key: 'module_validated:module-1',
      remaining: 1,
      label: 'Module « Comptabilité générale » à valider',
    });
    expect(JSON.stringify(result.value)).not.toMatch(/classement|leaderboard|rang/i);
    expect(execute).toHaveBeenCalledTimes(8);
  });

  it('CA-1 — un profil absent est un 404 sans fuite', async () => {
    const execute = vi.fn().mockResolvedValueOnce([]);
    const result = await getStreak(context(execute));
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
