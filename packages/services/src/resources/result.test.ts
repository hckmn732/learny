// Unit tests of the Result plumbing (SPEC-201 §2): AppErrors become values, defects rethrow.
import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import type { ServiceContext } from '../context';

import { requireUser, toResult } from './result';

describe('[SPEC-201] résultat de service', () => {
  it('emballe un succès et convertit une AppError en résultat', async () => {
    await expect(toResult(() => Promise.resolve(42))).resolves.toEqual({ ok: true, value: 42 });
    await expect(
      toResult(() => Promise.reject(new AppError('NOT_FOUND', 'Introuvable.'))),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('relance un défaut inattendu et exige une session', async () => {
    await expect(toResult(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    const anonymous = { userId: null, db: null } as ServiceContext;
    expect(() => requireUser(anonymous)).toThrow(AppError);
  });
});
