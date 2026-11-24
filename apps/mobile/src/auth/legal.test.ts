// Acceptance of a new version of the legal documents (SPEC-3101 EF-7, CL-6, BR-ACC-02).
import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { expectedLegalVersions, isLegalAcceptanceRequired } from './legal';

function required(): AppError {
  return new AppError('LEGAL_ACCEPTANCE_REQUIRED', 'Acceptation requise', {
    status: 422,
    errors: [
      { code: 'EXPECTED_VERSION', path: 'cguVersion', message: '2026-12-01' },
      { code: 'EXPECTED_VERSION', path: 'privacyVersion', message: '2026-12-01' },
    ],
  });
}

describe('[SPEC-3101] acceptation des CGU', () => {
  it('lit les versions actives dans le refus 422 du serveur (EF-7, CL-6)', () => {
    expect(expectedLegalVersions(required())).toEqual({
      cguVersion: '2026-12-01',
      privacyVersion: '2026-12-01',
    });
  });

  it('reconnaît le code du refus', () => {
    expect(isLegalAcceptanceRequired(required())).toBe(true);
    expect(isLegalAcceptanceRequired(new AppError('CONFLICT', 'Conflit', { status: 409 }))).toBe(
      false,
    );
    expect(isLegalAcceptanceRequired(new Error('boom'))).toBe(false);
  });

  it('ne devine aucune version quand le refus ne les porte pas', () => {
    const withoutVersions = new AppError('LEGAL_ACCEPTANCE_REQUIRED', 'Acceptation requise', {
      status: 422,
    });
    expect(expectedLegalVersions(withoutVersions)).toBeNull();

    const partial = new AppError('LEGAL_ACCEPTANCE_REQUIRED', 'Acceptation requise', {
      status: 422,
      errors: [{ code: 'EXPECTED_VERSION', path: 'cguVersion', message: '2026-12-01' }],
    });
    expect(expectedLegalVersions(partial)).toBeNull();
  });

  it('ignore une autre erreur, même portant des versions', () => {
    const other = new AppError('VALIDATION_FAILED', 'Données invalides', {
      status: 400,
      errors: [{ path: 'cguVersion', message: '2026-12-01' }],
    });
    expect(expectedLegalVersions(other)).toBeNull();
  });
});
