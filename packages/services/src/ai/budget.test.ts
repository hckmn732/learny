// Unit tests of the AI budget guard (SPEC-507 EF-1 to EF-3). The owner-role client and journal
// are mocked: these tests pin the personal-key bypass, the reservation and the deferral.
import { describe, expect, it, vi } from 'vitest';

import { TestClock } from '../../test/support/fakes';

const mocks = vi.hoisted(() => ({
  spend: vi.fn(),
  reserved: vi.fn(),
  reserve: vi.fn(),
  record: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('@learny/db', async () => {
  const { z } = await import('zod');
  return {
    aiTaskSchema: z.string(),
    getSpendToday: mocks.spend,
    sumReservedUsd: mocks.reserved,
    reserveBudget: mocks.reserve,
    settleBudgetReservation: vi.fn(),
    serviceDb: () => ({}),
    schema: { profiles: {}, subscriptions: {} },
  };
});

vi.mock('./journal', () => ({
  recordAiCall: mocks.record,
  ensureCostAlert: mocks.alert,
}));

vi.mock('@learny/notifications', () => ({
  notify: vi.fn().mockResolvedValue({ ok: true, value: { created: false } }),
}));

const { checkAndReserveAiBudget } = await import('./budget');

const USER = '11111111-1111-4111-8111-111111111111';
const AT = new Date('2026-11-11T12:20:00Z');
const ctx = {
  requestId: 'req-budget',
  clock: new TestClock(AT.toISOString()),
  logger: {} as never,
};

function sdb(options: { profile?: boolean; cap?: string } = {}) {
  const selects = [
    {
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(options.profile === false ? [] : [{ timezone: 'UTC' }]),
        }),
      }),
    },
    {
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ cap: options.cap ?? '10.000000' }]),
        }),
      }),
    },
  ];
  return {
    select: vi.fn(() => selects.shift()),
    transaction: (fn: (inner: unknown) => Promise<unknown>) => fn({}),
  };
}

function input(partial: Record<string, unknown> = {}) {
  return {
    userId: USER,
    task: 'tutor' as const,
    model: 'claude-haiku-5-5',
    estimatedInputTokens: 100,
    estimatedOutputTokens: 100,
    managed: true,
    at: AT,
    ...partial,
  };
}

describe('[SPEC-507] garde-fou de budget', () => {
  it('refuse une entrée invalide et un profil absent', async () => {
    const invalid = await checkAndReserveAiBudget(ctx, input({ userId: 'pas-un-uuid' }), {
      sdb: sdb() as never,
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

    const missing = await checkAndReserveAiBudget(ctx, input(), {
      sdb: sdb({ profile: false }) as never,
    });
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('ne consomme pas le plafond pour une clé personnelle (ADR-0012)', async () => {
    mocks.spend.mockResolvedValue('0.200000');
    mocks.reserve.mockResolvedValue({ reservation: null, spentUsd: '0', reservedUsd: '0' });

    const result = await checkAndReserveAiBudget(ctx, input({ managed: false }), {
      sdb: sdb({ cap: '1.000000' }) as never,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { decision: 'allow', reservationId: null },
    });
  });

  it('réserve le coût estimé et déclenche l’alerte de seuil (EF-1, EF-2)', async () => {
    mocks.spend.mockResolvedValue('0.200000');
    mocks.reserved.mockResolvedValue('0.100000');
    mocks.reserve.mockResolvedValue({
      reservation: { id: 'r1' },
      spentUsd: '0.2',
      reservedUsd: '0.1',
    });
    mocks.alert.mockResolvedValue(true);

    const result = await checkAndReserveAiBudget(ctx, input(), {
      sdb: sdb({ cap: '10.000000' }) as never,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { decision: 'allow', reservationId: 'r1', alertCreated: true },
    });
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
  });

  it('reporte et journalise une décision plafonnée (EF-3)', async () => {
    mocks.spend.mockResolvedValue('10.000000');
    mocks.reserved.mockResolvedValue('0');
    mocks.reserve.mockResolvedValue({ reservation: null, spentUsd: '10', reservedUsd: '0' });
    mocks.record.mockResolvedValue({ ok: true });

    const result = await checkAndReserveAiBudget(
      ctx,
      input({ model: 'claude-opus-5-5', task: 'course' }),
      { sdb: sdb({ cap: '10.000000' }) as never },
    );

    expect(result).toMatchObject({
      ok: true,
      value: { decision: 'defer', defer: true, reservationId: null },
    });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'capped', errorCode: 'AI_CAP_REACHED' }),
      expect.anything(),
    );
  });
});
