// Unit tests of the AI call journal (SPEC-507 EF-2, ET-2 to ET-4). Repositories and notifications
// are mocked: these tests pin idempotent replay, cost projection and the best-effort 80 % alert.
import { describe, expect, it, vi } from 'vitest';

import { TestClock } from '../../test/support/fakes';

const mocks = vi.hoisted(() => ({
  getReservation: vi.fn(),
  recordRow: vi.fn(),
  settle: vi.fn(),
  spend: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@learny/db', async () => {
  const { z } = await import('zod');
  return {
    aiCalls: { id: 'id' },
    aiCallStatusSchema: z.enum(['ok', 'error', 'refused', 'capped']),
    aiProviderSchema: z.enum(['anthropic', 'openai_compatible', 'local', 'mock']),
    aiTaskSchema: z.string(),
    costUsdSchema: z.string(),
    latencyMsSchema: z.number().int().nonnegative(),
    modelIdSchema: z.string(),
    tokenCountSchema: z.number().int().nonnegative(),
    getBudgetReservation: mocks.getReservation,
    recordAiCall: mocks.recordRow,
    settleBudgetReservation: mocks.settle,
    getSpendToday: mocks.spend,
    serviceDb: () => ({ transaction: vi.fn() }),
    schema: { profiles: {}, subscriptions: {} },
  };
});

vi.mock('@learny/notifications', () => ({ notify: mocks.notify }));

const { ensureCostAlert, recordAiCall, toCallDto } = await import('./journal');

const USER = '11111111-1111-4111-8111-111111111111';
const CALL = '22222222-2222-4222-8222-222222222222';
const AT = new Date('2026-11-11T12:20:00Z');
const ctx = {
  requestId: 'req-journal',
  clock: new TestClock(AT.toISOString()),
  logger: {} as never,
};

function row(partial: Record<string, unknown> = {}) {
  return {
    id: CALL,
    userId: USER,
    formationId: null,
    task: 'tutor' as const,
    provider: 'anthropic' as const,
    model: 'claude-haiku-5-5',
    managed: true,
    inputTokens: 10,
    outputTokens: 20,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: '0.000120',
    latencyMs: 120,
    status: 'ok',
    errorCode: null,
    batch: false,
    createdAt: AT,
    ...partial,
  };
}

function input(partial: Record<string, unknown> = {}) {
  return {
    userId: USER,
    task: 'tutor' as const,
    provider: 'anthropic' as const,
    model: 'claude-haiku-5-5',
    managed: false,
    usage: { inputTokens: 10, outputTokens: 20 },
    latencyMs: 120,
    status: 'ok' as const,
    ...partial,
  };
}

function sdb(tx: Record<string, unknown>) {
  return { transaction: (fn: (inner: unknown) => Promise<unknown>) => fn(tx) };
}

describe('[SPEC-507] journal des appels IA', () => {
  it('projette une ligne en DTO sans secret (ET-3)', () => {
    expect(toCallDto(row() as never)).toMatchObject({
      id: CALL,
      task: 'tutor',
      costUsd: '0.000120',
      createdAt: AT.toISOString(),
    });
  });

  it('refuse une entrée invalide', async () => {
    const result = await recordAiCall(ctx, input({ userId: 'pas-un-uuid' }));
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('écrit une ligne et ne déclenche pas d’alerte pour une clé personnelle (ET-2)', async () => {
    mocks.recordRow.mockResolvedValue(row());
    const result = await recordAiCall(ctx, input(), {
      sdb: sdb({}) as never,
    });

    expect(result).toMatchObject({ ok: true, value: { replayed: false, alertCreated: false } });
    expect(mocks.recordRow).toHaveBeenCalledTimes(1);
  });

  it('renvoie la ligne existante pour une réservation déjà consommée (ET-4)', async () => {
    mocks.getReservation.mockResolvedValue({ status: 'consumed', callId: CALL });
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve([row()]),
    };
    const result = await recordAiCall(ctx, input({ reservationId: USER }), {
      sdb: sdb({ select: () => chain }) as never,
    });

    expect(result).toMatchObject({ ok: true, value: { replayed: true } });
  });

  it('refuse une réservation absente ou déjà clôturée', async () => {
    mocks.getReservation.mockResolvedValueOnce(null);
    const missing = await recordAiCall(ctx, input({ reservationId: USER }), {
      sdb: sdb({}) as never,
    });
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    mocks.getReservation.mockResolvedValueOnce({ status: 'released', callId: null });
    const closed = await recordAiCall(ctx, input({ reservationId: USER }), {
      sdb: sdb({}) as never,
    });
    expect(closed).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('crée au plus une alerte de coût par jour local (EF-2)', async () => {
    const selects = [
      { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ timezone: 'UTC' }]) }) }) },
      {
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ cap: '1.000000' }]) }),
        }),
      },
    ];
    const db = {
      select: vi.fn(() => selects.shift()),
      transaction: (fn: (inner: unknown) => Promise<unknown>) => fn({}),
    };
    mocks.spend.mockResolvedValue('0.900000');
    mocks.notify.mockResolvedValue({ ok: true, value: { created: true } });

    await expect(ensureCostAlert(ctx, { userId: USER, at: AT, sdb: db as never })).resolves.toBe(
      true,
    );
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dedupeKey: 'ai_cost_alert:2026-11-11' }),
    );
  });

  it('reste silencieuse sans profil, sous le seuil ou si la notification échoue', async () => {
    mocks.spend.mockResolvedValue('0');
    const noProfile = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
      transaction: (fn: (inner: unknown) => Promise<unknown>) => fn({}),
    };
    await expect(
      ensureCostAlert(ctx, { userId: USER, at: AT, sdb: noProfile as never }),
    ).resolves.toBe(false);

    const low = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: () => Promise.resolve([{ timezone: 'UTC' }]) }) }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: () => Promise.resolve([{ cap: '10.000000' }]) }) }),
        }),
      transaction: (fn: (inner: unknown) => Promise<unknown>) => fn({}),
    };
    await expect(ensureCostAlert(ctx, { userId: USER, at: AT, sdb: low as never })).resolves.toBe(
      false,
    );

    const high = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: () => Promise.resolve([{ timezone: 'UTC' }]) }) }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: () => Promise.resolve([{ cap: '1.000000' }]) }) }),
        }),
      transaction: (fn: (inner: unknown) => Promise<unknown>) => fn({}),
    };
    mocks.spend.mockResolvedValue('0.900000');
    mocks.notify.mockRejectedValue(new Error('down'));
    await expect(ensureCostAlert(ctx, { userId: USER, at: AT, sdb: high as never })).resolves.toBe(
      false,
    );
  });
});
