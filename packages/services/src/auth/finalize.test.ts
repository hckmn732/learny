// Unit tests of the first-verification finalization (SPEC-202 EF-10, ET-4, ET-5, CL-8):
// legal acceptances, time zone, one `user/signed-up`, idempotence. The database and the event bus
// are fakes; the business decisions are those of the module.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LearnyLogger } from '@learny/core';

import { silentLogger, TestClock } from '../../test/support/fakes';

const mocks = vi.hoisted(() => {
  const tx = { execute: vi.fn() };
  const db = { execute: vi.fn(), transaction: vi.fn() };
  return {
    tx,
    db,
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      text: strings.join('?'),
      values,
    })),
    recordLegalAcceptance: vi.fn(),
    send: vi.fn(),
  };
});

vi.mock('@learny/db', () => ({
  serviceDb: () => mocks.db,
  sql: mocks.sql,
  recordLegalAcceptance: mocks.recordLegalAcceptance,
}));

vi.mock('@learny/jobs', () => ({ inngest: { send: mocks.send } }));

import { finalizeFirstVerification, loadDestinationProfile, setSignedUpEmitter } from './finalize';

const USER = '11111111-1111-4111-8111-111111111111';
const clock = new TestClock();

function ctx(logger: LearnyLogger = silentLogger()) {
  return { clock, logger };
}

beforeEach(() => {
  mocks.tx.execute.mockReset();
  mocks.db.execute.mockReset();
  mocks.db.transaction.mockReset();
  mocks.recordLegalAcceptance.mockReset();
  mocks.send.mockReset();
  mocks.db.transaction.mockImplementation(
    async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx),
  );
});

function signup(overrides: Record<string, unknown> = {}) {
  return {
    meta: {
      signup: {
        termsAcceptedAt: '2026-11-11T12:00:00Z',
        cguVersion: '2026-01',
        privacyVersion: '2026-02',
        timezone: 'Europe/Paris',
        method: 'magic_link',
        ...overrides,
      },
    },
  };
}

describe('[SPEC-202] première vérification', () => {
  it('charge le profil destination, ou considère un compte neuf (CL-6)', async () => {
    mocks.db.execute.mockResolvedValueOnce([
      { onboarding_step: 'rythme', deletion_scheduled_for: new Date('2026-12-01T00:00:00Z') },
    ]);
    await expect(loadDestinationProfile(USER)).resolves.toEqual({
      onboardingStep: 'rythme',
      deletionScheduledFor: new Date('2026-12-01T00:00:00Z'),
    });
    mocks.db.execute.mockResolvedValueOnce([]);
    await expect(loadDestinationProfile(USER)).resolves.toEqual({
      onboardingStep: 'profil',
      deletionScheduledFor: null,
    });
    expect(mocks.sql.mock.calls.some((call) => call[1] === USER)).toBe(true);
  });

  it('ne fait rien pour un compte déjà finalisé (idempotence, CL-8)', async () => {
    mocks.tx.execute
      .mockResolvedValueOnce([]) // lock
      .mockResolvedValueOnce([{ count: 2 }]); // legal_acceptances
    await expect(finalizeFirstVerification(ctx(), USER, 'magic_link')).resolves.toEqual({
      firstTime: false,
    });
    expect(mocks.recordLegalAcceptance).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('ne fait rien quand les métadonnées d’inscription sont absentes ou invalides', async () => {
    const variants: unknown[][] = [
      [],
      [{ meta: null }],
      [{ meta: { signup: 'x' } }],
      [signup({ termsAcceptedAt: 'pas une date' })],
    ];
    for (const rows of variants) {
      mocks.tx.execute.mockReset();
      mocks.tx.execute
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce(rows);
      await expect(finalizeFirstVerification(ctx(), USER, 'magic_link')).resolves.toEqual({
        firstTime: false,
      });
    }
    expect(mocks.recordLegalAcceptance).not.toHaveBeenCalled();
  });

  it('enregistre les deux acceptations, la zone connue et émet un unique événement', async () => {
    mocks.tx.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([signup()])
      .mockResolvedValueOnce([{ ok: true }])
      .mockResolvedValueOnce([]);
    await expect(finalizeFirstVerification(ctx(), USER, 'magic_link')).resolves.toEqual({
      firstTime: true,
    });
    expect(mocks.recordLegalAcceptance).toHaveBeenCalledTimes(2);
    expect(mocks.recordLegalAcceptance).toHaveBeenNthCalledWith(1, mocks.tx, {
      userId: USER,
      document: 'cgu',
      version: '2026-01',
      acceptedAt: new Date('2026-11-11T12:00:00Z'),
    });
    expect(mocks.recordLegalAcceptance).toHaveBeenNthCalledWith(2, mocks.tx, {
      userId: USER,
      document: 'privacy',
      version: '2026-02',
      acceptedAt: new Date('2026-11-11T12:00:00Z'),
    });
    expect(mocks.send).toHaveBeenCalledWith({
      id: `user-signed-up:${USER}`,
      name: 'user/signed-up',
      data: { userId: USER, method: 'magic_link', signedUpAt: '2026-11-11T12:20:00.000Z' },
    });
  });

  it('préfère la méthode d’inscription stockée et ignore une zone inconnue', async () => {
    mocks.tx.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([signup({ method: 'password', timezone: 'Mars/Olympus' })])
      .mockResolvedValueOnce([]);
    await expect(finalizeFirstVerification(ctx(), USER, 'magic_link')).resolves.toEqual({
      firstTime: true,
    });
    const lastSent = mocks.send.mock.calls.at(-1)?.[0] as { data: { method: string } } | undefined;
    expect(lastSent?.data.method).toBe('password');
    // No timezone existence query: the invalid name was refused by the pure validator.
    expect(mocks.tx.execute).toHaveBeenCalledTimes(4);
  });

  it('n’écrit pas de zone quand elle est absente ou inconnue de Postgres', async () => {
    mocks.tx.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ meta: { signup: { termsAcceptedAt: '2026-11-11T12:00:00Z' } } }])
      .mockResolvedValueOnce([]);
    await finalizeFirstVerification(ctx(), USER, 'magic_link');
    expect(mocks.tx.execute).toHaveBeenCalledTimes(4);

    mocks.tx.execute.mockReset();
    mocks.tx.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([signup()])
      .mockResolvedValueOnce([{ ok: false }])
      .mockResolvedValueOnce([]);
    await finalizeFirstVerification(ctx(), USER, 'magic_link');
    expect(mocks.tx.execute).toHaveBeenCalledTimes(5);
  });

  it('utilise la méthode de repli et ne fait jamais échouer la connexion si le bus tombe', async () => {
    mocks.tx.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ meta: { signup: { termsAcceptedAt: '2026-11-11T12:00:00Z' } } }])
      .mockResolvedValueOnce([]);
    mocks.send.mockRejectedValueOnce(new Error('bus hors ligne'));
    const error = vi.fn();
    const logger = { ...silentLogger(), error } as unknown as LearnyLogger;
    await expect(finalizeFirstVerification(ctx(logger), USER, 'password')).resolves.toEqual({
      firstTime: true,
    });
    expect(error).toHaveBeenCalledWith(
      'user/signed-up not emitted',
      { code: 'SERVICE_UNAVAILABLE' },
      expect.any(Error),
    );
    const lastSent = mocks.send.mock.calls.at(-1)?.[0] as { data: { method: string } } | undefined;
    expect(lastSent?.data.method).toBe('password');
  });

  it('remplace l’émetteur pour un test puis restaure Inngest', async () => {
    const custom = vi.fn().mockResolvedValue(undefined);
    const restore = setSignedUpEmitter(custom);
    mocks.tx.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ meta: { signup: { termsAcceptedAt: '2026-11-11T12:00:00Z' } } }])
      .mockResolvedValueOnce([]);
    await finalizeFirstVerification(ctx(), USER, 'magic_link');
    expect(custom).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
    restore();
    mocks.tx.execute.mockReset();
    mocks.tx.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ meta: { signup: { termsAcceptedAt: '2026-11-11T12:00:00Z' } } }])
      .mockResolvedValueOnce([]);
    await finalizeFirstVerification(ctx(), USER, 'magic_link');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
