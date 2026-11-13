// Unit tests of the AI usage read (SPEC-507 EF-4, EF-5). Repository reads are mocked: these
// tests pin the local day, the cap, the percentage and the deferral/alert keys.
import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

const mocks = vi.hoisted(() => ({
  getSpendToday: vi.fn(),
  getSubscription: vi.fn(),
  listAiUsage: vi.fn(),
}));

vi.mock('@learny/db', () => ({
  DEFAULT_DAILY_CAP_USD: '1.5',
  getSpendToday: mocks.getSpendToday,
  getSubscription: mocks.getSubscription,
  listAiUsage: mocks.listAiUsage,
  schema: { profiles: {} },
}));

const { getAiUsage } = await import('./usage');
const { costAlertKey, programmeDeferredKey } = await import('./usage-key');

const USER = '11111111-1111-4111-8111-111111111111';
const AT = new Date('2026-11-11T12:20:00Z');

function context(): ServiceContext {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve([{ timezone: 'Europe/Paris' }]),
  };
  return {
    userId: USER,
    requestId: 'req-usage',
    db: {
      run: (flow: (tx: unknown) => Promise<unknown>) => flow({ select: () => chain }),
    } as UserDatabase,
    clock: new TestClock(AT.toISOString()),
    logger: {} as never,
  };
}

describe('[SPEC-507] usage IA', () => {
  it('calcule la dépense, le plafond et l’historique dans le fuseau du profil', async () => {
    mocks.getSubscription.mockResolvedValue({ dailyCapUsd: '2.000000' });
    mocks.getSpendToday.mockResolvedValue('1.500000');
    mocks.listAiUsage.mockResolvedValue([
      {
        day: '2026-11-11',
        formationId: null,
        calls: 3,
        spentUsd: '1.500000',
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    ]);

    const result = await getAiUsage(context(), {});

    expect(result).toMatchObject({
      ok: true,
      value: {
        day: '2026-11-11',
        timezone: 'Europe/Paris',
        spentUsd: '1.500000',
        capUsd: '2.000000',
        percentUsed: 75,
        alert: false,
        history: [{ day: '2026-11-11', calls: 3, spentUsd: '1.500000' }],
      },
    });
  });

  it('refuse une plage inversée', async () => {
    mocks.getSubscription.mockResolvedValue(null);
    mocks.getSpendToday.mockResolvedValue('0');
    mocks.listAiUsage.mockResolvedValue([]);

    const result = await getAiUsage(context(), { from: '2026-11-12', to: '2026-11-10' });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('construit les clés de déduplication du jour local', () => {
    expect(costAlertKey('2026-11-11')).toBe('ai_cost_alert:2026-11-11');
    expect(programmeDeferredKey('2026-11-11')).toBe('ai_programme_deferred:2026-11-11');
  });
});
