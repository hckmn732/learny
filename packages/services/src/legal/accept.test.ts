import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clock } from '@learny/core';
import { AppError } from '@learny/core';

const mocks = vi.hoisted(() => ({
  recordLegalAcceptance: vi.fn(),
  latestLegalAcceptance: vi.fn(),
  sql: vi.fn(() => ({ kind: 'sql' })),
}));

vi.mock('@learny/db', () => ({
  recordLegalAcceptance: mocks.recordLegalAcceptance,
  latestLegalAcceptance: mocks.latestLegalAcceptance,
  sql: mocks.sql,
}));

import type { ServiceContext } from '../context';

import {
  LEGAL_EXEMPT_OPERATIONS,
  acceptLegalVersions,
  enforceLegalAcceptance,
  isLegalGuardExempt,
  requireCurrentLegalAcceptance,
} from './accept';

const USER = '11111111-1111-4111-8111-111111111111';
const FIXED = new Date('2026-11-11T12:20:00Z');
const VERSIONS = { cgu: '2026-11-11', privacy: '2026-11-11' };
const UPDATED = { cgu: '2027-01-01', privacy: '2027-02-01' };

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

const tx = { execute: vi.fn() };

function context(): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-806',
    db: { run: <T>(fn: (value: typeof tx) => Promise<T>) => fn(tx) },
    clock: new TestClock(),
    logger: {
      fatal: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(),
    } as unknown as ServiceContext['logger'],
    sdb: undefined,
  } as unknown as ServiceContext;
}

function acceptance(document: 'cgu' | 'privacy', version: string, acceptedAt = FIXED) {
  return {
    id: `${document}-id`,
    userId: USER,
    document,
    version,
    acceptedAt,
  };
}

beforeEach(() => {
  mocks.recordLegalAcceptance.mockReset();
  mocks.latestLegalAcceptance.mockReset();
  tx.execute.mockReset();
});

describe('[SPEC-806] legal acceptance', () => {
  it('CA-2 — un accord valide écrit les deux documents avec l’horloge injectée, une fois', async () => {
    mocks.recordLegalAcceptance
      .mockResolvedValueOnce({ acceptance: acceptance('cgu', VERSIONS.cgu), created: true })
      .mockResolvedValueOnce({
        acceptance: acceptance('privacy', VERSIONS.privacy),
        created: true,
      });

    const state = await acceptLegalVersions(
      context(),
      { cguVersion: VERSIONS.cgu, privacyVersion: VERSIONS.privacy },
      VERSIONS,
    );

    expect(mocks.recordLegalAcceptance).toHaveBeenCalledTimes(2);
    expect(mocks.recordLegalAcceptance).toHaveBeenNthCalledWith(1, tx, {
      userId: USER,
      document: 'cgu',
      version: VERSIONS.cgu,
      acceptedAt: FIXED,
    });
    expect(mocks.recordLegalAcceptance).toHaveBeenNthCalledWith(2, tx, {
      userId: USER,
      document: 'privacy',
      version: VERSIONS.privacy,
      acceptedAt: FIXED,
    });
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(state).toEqual({
      cguVersion: VERSIONS.cgu,
      privacyVersion: VERSIONS.privacy,
      acceptedAt: FIXED.toISOString(),
      complete: true,
    });
  });

  it('CA-2 — une version soumise obsolète est refusée sans aucune ligne partielle', async () => {
    await expect(
      acceptLegalVersions(
        context(),
        { cguVersion: '2026-10-01', privacyVersion: VERSIONS.privacy },
        UPDATED,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.recordLegalAcceptance).not.toHaveBeenCalled();
    expect(tx.execute).not.toHaveBeenCalled();

    await expect(
      acceptLegalVersions(context(), { cguVersion: VERSIONS.cgu, privacyVersion: '' }, VERSIONS),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('CL-3 — une double demande conserve l’horodatage d’origine traçable', async () => {
    const original = new Date('2026-11-01T09:00:00Z');
    mocks.recordLegalAcceptance
      .mockResolvedValueOnce({
        acceptance: acceptance('cgu', VERSIONS.cgu, original),
        created: false,
      })
      .mockResolvedValueOnce({
        acceptance: acceptance('privacy', VERSIONS.privacy, original),
        created: false,
      });

    const state = await acceptLegalVersions(
      context(),
      { cguVersion: VERSIONS.cgu, privacyVersion: VERSIONS.privacy },
      VERSIONS,
    );

    expect(state.acceptedAt).toBe(original.toISOString());
    expect(mocks.recordLegalAcceptance).toHaveBeenCalledTimes(2);
  });

  it('CA-3 — le garde serveur exige les deux versions actives et donne les versions attendues', async () => {
    mocks.latestLegalAcceptance
      .mockResolvedValueOnce(acceptance('cgu', VERSIONS.cgu))
      .mockResolvedValueOnce(acceptance('privacy', VERSIONS.privacy));
    await expect(requireCurrentLegalAcceptance(context(), VERSIONS)).resolves.toBeUndefined();

    mocks.latestLegalAcceptance
      .mockResolvedValueOnce(acceptance('cgu', VERSIONS.cgu))
      .mockResolvedValueOnce(acceptance('privacy', VERSIONS.privacy));
    await expect(requireCurrentLegalAcceptance(context(), UPDATED)).rejects.toMatchObject({
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
      errors: [
        { code: 'EXPECTED_VERSION', path: 'cguVersion', message: UPDATED.cgu },
        { code: 'EXPECTED_VERSION', path: 'privacyVersion', message: UPDATED.privacy },
      ],
    });

    mocks.latestLegalAcceptance
      .mockResolvedValueOnce(acceptance('cgu', UPDATED.cgu))
      .mockResolvedValueOnce(acceptance('privacy', UPDATED.privacy));
    await expect(requireCurrentLegalAcceptance(context(), UPDATED)).resolves.toBeUndefined();
  });

  it('CA-3 — export, suppression, connexion et renouvellement sont exemptés du garde', async () => {
    expect(LEGAL_EXEMPT_OPERATIONS).toEqual(
      expect.arrayContaining([
        'auth.signIn',
        'me.export.request',
        'me.export.read',
        'me.deletion.schedule',
        'me.deletion.cancel',
        'me.legal.accept',
      ]),
    );
    for (const operation of LEGAL_EXEMPT_OPERATIONS) {
      expect(isLegalGuardExempt(operation)).toBe(true);
    }
    expect(isLegalGuardExempt('legal.read')).toBe(true);
    expect(isLegalGuardExempt('formations.create')).toBe(false);

    mocks.latestLegalAcceptance.mockImplementation(() => Promise.resolve(null));
    await expect(enforceLegalAcceptance(context(), 'me.export.request')).resolves.toBeUndefined();
    expect(mocks.latestLegalAcceptance).not.toHaveBeenCalled();
    await expect(enforceLegalAcceptance(context(), 'formations.create')).rejects.toMatchObject({
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
    });
  });
});
