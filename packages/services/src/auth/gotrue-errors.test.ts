import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { mapGotrueError, retryAfterFromMessage } from './gotrue-errors';

function error(outcome: ReturnType<typeof mapGotrueError>): AppError {
  if (outcome.kind !== 'error') throw new Error('erreur attendue');
  return outcome.error;
}

describe('[SPEC-202] correspondance des erreurs', () => {
  it('maps invalid credentials to 401 INVALID_CREDENTIALS', () => {
    const mapped = error(mapGotrueError({ code: 'invalid_credentials', status: 400 }));
    expect(mapped.code).toBe('INVALID_CREDENTIALS');
    expect(mapped.detail).toBe('Adresse e-mail ou mot de passe incorrect.');
  });

  it('maps an unconfirmed e-mail to 403 EMAIL_NOT_CONFIRMED', () => {
    const mapped = error(mapGotrueError({ code: 'email_not_confirmed', status: 400 }));
    expect(mapped.code).toBe('EMAIL_NOT_CONFIRMED');
    expect(mapped.detail).toBe('Vérifiez votre adresse e-mail avant de vous connecter.');
  });

  it.each([
    [
      {
        code: 'over_email_send_rate_limit',
        message: 'you can only request this after 37 seconds.',
      },
      37,
    ],
    [{ message: 'For security purposes, you can only request this after 1 second.' }, 1],
    [{ code: 'over_email_send_rate_limit' }, 60],
    [{ code: 'over_email_send_rate_limit', message: 'after 900 seconds' }, 60],
  ])('maps the resend limit %j to RESEND_TOO_SOON with %i s', (input, seconds) => {
    const mapped = error(mapGotrueError(input));
    expect(mapped.code).toBe('RESEND_TOO_SOON');
    expect(mapped.retryAfterSec).toBe(seconds);
    expect(mapped.detail).toBe(`Vous pourrez renvoyer le lien dans ${String(seconds)} secondes.`);
  });

  it('extracts and bounds the number of seconds', () => {
    expect(retryAfterFromMessage('only request this after 12 seconds')).toBe(12);
    expect(retryAfterFromMessage(undefined)).toBe(60);
    expect(retryAfterFromMessage('after 0 seconds')).toBe(1);
  });

  it.each(['otp_disabled', 'signup_disabled'])(
    'answers silently to %s when the address is unknown (no enumeration)',
    (code) => {
      expect(mapGotrueError({ code }, { silentWhenUnknownUser: true }).kind).toBe('silent');
      expect(mapGotrueError({ code }).kind).toBe('error');
    },
  );

  it('answers silently to an address already registered only when asked to', () => {
    expect(
      mapGotrueError({ code: 'user_already_exists' }, { silentWhenAlreadyRegistered: true }).kind,
    ).toBe('silent');
    expect(error(mapGotrueError({ code: 'user_already_exists' })).code).toBe('SERVICE_UNAVAILABLE');
  });

  it('maps a weak password to a validation error on body.password', () => {
    const mapped = error(mapGotrueError({ code: 'weak_password' }));
    expect(mapped.code).toBe('VALIDATION_FAILED');
    expect(mapped.errors?.[0]?.path).toBe('body.password');
  });

  it.each([
    [{ status: 500 }],
    [{ status: 0, message: 'fetch failed' }],
    [{ code: 'unexpected_failure', status: 502 }],
    [{}],
  ])('maps the failure %j to 503 SERVICE_UNAVAILABLE', (input) => {
    expect(error(mapGotrueError(input)).code).toBe('SERVICE_UNAVAILABLE');
  });

  it('maps a request rate limit to 429 RATE_LIMITED', () => {
    expect(error(mapGotrueError({ code: 'over_request_rate_limit', status: 429 })).code).toBe(
      'RATE_LIMITED',
    );
  });
});
