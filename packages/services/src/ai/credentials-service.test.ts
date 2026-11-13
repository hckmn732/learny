// Unit tests of the personal-credential service boundaries (SPEC-505 EF-2, EF-3, ET-2, CL-6).
// The database is a fake: these tests pin masking, ownership 404 and the status transition.
import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

vi.mock('@learny/db', () => ({
  aiCredentials: { id: 'id', userId: 'user_id', createdAt: 'created_at', qualification: 'q' },
  aiTaskModels: { userId: 'user_id', credentialId: 'credential_id' },
  credentialStatusSchema: {
    safeParse: (value: unknown) => ({
      success: ['untested', 'qualified', 'failed'].includes(String(value)),
    }),
  },
}));

const { deleteCredential, listCredentials, localModelsAllowed, markCredentialStatus } =
  await import('./credentials-service');

const USER = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL = '22222222-2222-4222-8222-222222222222';

function context(tx: Record<string, unknown>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-credentials',
    db: { run: (flow: (inner: unknown) => Promise<unknown>) => flow(tx) } as UserDatabase,
    clock: new TestClock('2026-11-11T12:20:00Z'),
    logger: {} as never,
  };
}

function row(partial: Record<string, unknown> = {}) {
  return {
    id: CREDENTIAL,
    userId: USER,
    provider: 'anthropic',
    label: 'Clé perso',
    baseUrl: null,
    modelIds: ['claude-sonnet-4-5'],
    keyLast4: 'abcd',
    status: 'qualified',
    qualification: { keyPrefix: 'sk-ant' },
    outsideEu: true,
    qualifiedAt: new Date('2026-11-10T10:00:00Z'),
    createdAt: new Date('2026-11-09T10:00:00Z'),
    updatedAt: new Date('2026-11-10T10:00:00Z'),
    encryptedKey: null,
    ...partial,
  };
}

function listChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return { select: () => chain };
}

describe('[SPEC-505] service des clés personnelles', () => {
  it('liste les clés en masquant la partie secrète (EF-2)', async () => {
    const result = await listCredentials(context(listChain([row()])));

    expect(result).toMatchObject({
      ok: true,
      value: [{ id: CREDENTIAL, keyMasked: 'sk-ant-••••••••abcd', outsideEu: true }],
    });
  });

  it('refuse un identifiant invalide ou étranger à la suppression (CL-6, CL-8)', async () => {
    const invalid = await deleteCredential({ ...context({}), db: { run: vi.fn() } }, 'pas-un-uuid');
    expect(invalid).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const foreign = await deleteCredential(
      context({
        delete: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
      }),
      CREDENTIAL,
    );
    expect(foreign).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('supprime la clé et ses affectations dans la même transaction (EF-3)', async () => {
    const calls: string[] = [];
    const tx = {
      delete: () => {
        calls.push('delete');
        return {
          where: () =>
            calls.length === 1
              ? Promise.resolve(undefined)
              : { returning: () => Promise.resolve([{ id: CREDENTIAL }]) },
        };
      },
    };

    await expect(deleteCredential(context(tx), CREDENTIAL)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(calls).toHaveLength(2);
  });

  it('refuse un statut inconnu et une clé absente (ET-2)', async () => {
    const invalid = await markCredentialStatus(context({}), CREDENTIAL, 'mystery' as never);
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

    const missing = await markCredentialStatus(
      context({
        select: () => ({
          from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
        }),
      }),
      CREDENTIAL,
      'failed',
    );
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('met à jour le statut et conserve l’empreinte (ET-2)', async () => {
    const updates: unknown[] = [];
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ qualification: { keyFingerprint: 'fp' } }]),
          }),
        }),
      }),
      update: () => ({
        set: (values: unknown) => {
          updates.push(values);
          return { where: () => Promise.resolve(undefined) };
        },
      }),
    };

    await expect(
      markCredentialStatus(context(tx), CREDENTIAL, 'qualified', { score: 1 }),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(updates).toEqual([
      expect.objectContaining({
        status: 'qualified',
        qualification: { keyFingerprint: 'fp', score: 1 },
      }),
    ]);
  });

  it('n’autorise les modèles locaux que sur activation explicite (EF-5)', () => {
    expect(localModelsAllowed({ ALLOW_LOCAL_MODELS: 'true' })).toBe(true);
    expect(localModelsAllowed({ ALLOW_LOCAL_MODELS: 'false' })).toBe(false);
    expect(localModelsAllowed({})).toBe(false);
  });
});
