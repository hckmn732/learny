// Messages of the authentication failures (SPEC-3101 EF-5, CL-2, CA-4).
import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';
import { fr } from '@learny/i18n';

import { describeAuthError } from './auth-errors';

describe('[SPEC-3101] messages des erreurs d’authentification', () => {
  it('rend le message web des identifiants incorrects, sans révéler le compte (EF-5, ADR-0121)', () => {
    const failure = describeAuthError(
      new AppError('INVALID_CREDENTIALS', 'Identifiants incorrects', { status: 401 }),
    );

    expect(failure.kind).toBe('invalidCredentials');
    expect(failure.message).toBe(fr.auth.errors.invalidCredentials);
    expect(failure.retryAfterSec).toBeNull();
  });

  it('reconnaît le code de Supabase Auth (invalid_credentials)', () => {
    expect(describeAuthError({ code: 'invalid_credentials', status: 400 }).kind).toBe(
      'invalidCredentials',
    );
  });

  it('annonce un lien expiré avec le libellé de l’écran de retour (EF-6, CA-3)', () => {
    const failure = describeAuthError({ code: 'otp_expired', status: 403 });
    expect(failure.kind).toBe('linkExpired');
    expect(failure.message).toBe(fr.mobile.auth.callback.invalid);
  });

  it('affiche le délai d’un trop de tentatives quand le fournisseur le donne (EF-5)', () => {
    const failure = describeAuthError({
      status: 429,
      code: 'over_email_send_rate_limit',
      message: 'For security purposes, you can only request this after 42 seconds.',
    });

    expect(failure.kind).toBe('rateLimited');
    expect(failure.retryAfterSec).toBe(42);
    expect(failure.message).toBe(fr.mobile.errors.rateLimited.replace('{seconds}', '42'));
  });

  it('reprend le délai d’un 429 de l’API (Retry-After, BR-PLA-08)', () => {
    const failure = describeAuthError(
      new AppError('RATE_LIMITED', 'Trop de requêtes', { status: 429, retryAfterSec: 30 }),
    );

    expect(failure.kind).toBe('rateLimited');
    expect(failure.retryAfterSec).toBe(30);
    expect(failure.message).toContain('30');
  });

  it('traduit un réseau absent par la phrase web (CL-2)', () => {
    expect(describeAuthError(new TypeError('Network request failed')).kind).toBe('network');
    expect(describeAuthError(new TypeError('Network request failed')).message).toBe(
      fr.auth.errors.network,
    );
  });

  it('ne laisse jamais fuir un détail technique (CL-2)', () => {
    const failure = describeAuthError(new Error('boom: connection string postgres://secret'));
    expect(failure.message).toBe(fr.mobile.errors.generic);
    expect(failure.message).not.toContain('postgres');
  });

  it('reconnaît l’adresse non confirmée (EF-12 du web)', () => {
    expect(describeAuthError({ code: 'email_not_confirmed', status: 400 }).kind).toBe(
      'emailNotConfirmed',
    );
  });
});
