// Unit tests of the question-bank application service (SPEC-513 ET-1, ET-4). The tutor engine and
// the owner-role client are mocked: these tests pin the context handed to the tutor, the Result
// wrapping and the authenticated caller, not the generation itself.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { prepareQuestionBank, processQuestionBanks, requestQuestionBank } from './prepare-bank';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  request: vi.fn(),
  process: vi.fn(),
  serviceDb: vi.fn(() => ({ execute: vi.fn() })),
}));

vi.mock('@learny/tutor', () => ({
  prepareQuestionBank: mocks.prepare,
  requestQuestionBank: mocks.request,
  processQuestionBankJobs: mocks.process,
}));

vi.mock('@learny/db', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serviceDb: mocks.serviceDb,
}));

const USER = '11111111-1111-4111-8111-111111111111';
const INPUT = { courseVersionId: '22222222-2222-4222-8222-222222222222' };

function context(userId: string | null = USER): ServiceContext {
  return {
    userId,
    requestId: 'req-bank',
    db: { run: vi.fn() },
    clock: new TestClock('2026-11-11T12:20:00Z'),
    logger: {} as never,
  };
}

beforeEach(() => {
  mocks.prepare.mockReset();
  mocks.request.mockReset();
  mocks.process.mockReset();
  mocks.serviceDb.mockClear();
});

describe('[SPEC-513] service des banques de questions', () => {
  it('prépare une banque avec le contexte RLS et le client IA autorisé (ET-1)', async () => {
    mocks.prepare.mockResolvedValue({ complete: true, variants: [] });
    const ctx = context();

    await expect(prepareQuestionBank(ctx, INPUT)).resolves.toEqual({
      ok: true,
      value: { complete: true, variants: [] },
    });
    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        requestId: 'req-bank',
        store: ctx.db,
        clock: ctx.clock,
        logger: ctx.logger,
      }),
      INPUT,
    );
    expect(mocks.serviceDb).toHaveBeenCalledTimes(1);
  });

  it('met une demande de génération en file avec le même contexte (ET-1)', async () => {
    mocks.request.mockResolvedValue({ jobs: [] });
    const ctx = context();

    await expect(requestQuestionBank(ctx, INPUT)).resolves.toEqual({
      ok: true,
      value: { jobs: [] },
    });
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, store: ctx.db }),
      INPUT,
    );
  });

  it('traite les jobs système avec la limite demandée (ET-4)', async () => {
    mocks.process.mockResolvedValue({ processed: 2, failed: 0 });
    const ctx = context();

    await expect(processQuestionBanks(ctx, { limit: 10 })).resolves.toEqual({
      ok: true,
      value: { processed: 2, failed: 0 },
    });
    expect(mocks.process).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, store: ctx.db }),
      { limit: 10 },
    );

    await processQuestionBanks(ctx);
    expect(mocks.process).toHaveBeenLastCalledWith(expect.anything(), {});
  });

  it('refuse un appel sans session avant de joindre le tuteur', async () => {
    await expect(prepareQuestionBank(context(null), INPUT)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    await expect(requestQuestionBank(context(null), INPUT)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    await expect(processQuestionBanks(context(null))).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('renvoie une erreur métier du tuteur et laisse remonter un défaut', async () => {
    mocks.prepare.mockRejectedValue(new AppError('COURSE_NOT_READY', 'Cours indisponible.'));
    await expect(prepareQuestionBank(context(), INPUT)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COURSE_NOT_READY' },
    });

    mocks.request.mockRejectedValue(new Error('panne'));
    await expect(requestQuestionBank(context(), INPUT)).rejects.toThrow('panne');
  });
});
