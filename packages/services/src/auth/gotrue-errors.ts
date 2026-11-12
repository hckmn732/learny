// Translation of Supabase Auth (GoTrue) errors (SPEC-202 ET-2).
import { AppError } from '@learny/core';

export interface GotrueErrorLike {
  code?: string | undefined;
  message?: string | undefined;
  status?: number | undefined;
  name?: string | undefined;
}

/** `silent` = answer as if it worked (no account enumeration, ET-8). */
export type GotrueOutcome = { kind: 'error'; error: AppError } | { kind: 'silent' };

export const DEFAULT_RESEND_SECONDS = 60;

/** « … you can only request this after 37 seconds » → 37. */
export function retryAfterFromMessage(message: string | undefined): number {
  const match = /after (\d+) seconds?/i.exec(message ?? '');
  const seconds = match?.[1] === undefined ? DEFAULT_RESEND_SECONDS : Number(match[1]);
  return Math.min(Math.max(1, seconds), DEFAULT_RESEND_SECONDS);
}

function resendTooSoon(message: string | undefined): AppError {
  const seconds = retryAfterFromMessage(message);
  return new AppError(
    'RESEND_TOO_SOON',
    `Vous pourrez renvoyer le lien dans ${String(seconds)} secondes.`,
    { retryAfterSec: seconds },
  );
}

export function mapGotrueError(
  error: GotrueErrorLike,
  context: { silentWhenUnknownUser?: boolean; silentWhenAlreadyRegistered?: boolean } = {},
): GotrueOutcome {
  const code = error.code ?? '';
  const message = error.message ?? '';
  if (code === 'invalid_credentials') {
    return {
      kind: 'error',
      error: new AppError('INVALID_CREDENTIALS', 'Adresse e-mail ou mot de passe incorrect.'),
    };
  }
  if (code === 'email_not_confirmed') {
    return {
      kind: 'error',
      error: new AppError(
        'EMAIL_NOT_CONFIRMED',
        'Vérifiez votre adresse e-mail avant de vous connecter.',
      ),
    };
  }
  if (
    code === 'over_email_send_rate_limit' ||
    /only request this after \d+ seconds?/i.test(message)
  ) {
    return { kind: 'error', error: resendTooSoon(message) };
  }
  if (
    context.silentWhenUnknownUser === true &&
    (code === 'otp_disabled' || code === 'signup_disabled' || /signups? not allowed/i.test(message))
  ) {
    return { kind: 'silent' };
  }
  if (
    context.silentWhenAlreadyRegistered === true &&
    (code === 'user_already_exists' || code === 'email_exists')
  ) {
    return { kind: 'silent' };
  }
  if (code === 'weak_password') {
    return {
      kind: 'error',
      error: new AppError('VALIDATION_FAILED', 'Le mot de passe est trop faible.', {
        errors: [{ path: 'body.password', message: 'Choisissez un mot de passe plus long.' }],
      }),
    };
  }
  if (code === 'over_request_rate_limit' || error.status === 429) {
    return {
      kind: 'error',
      error: new AppError('RATE_LIMITED', 'Trop de tentatives : réessayez dans un instant.', {
        retryAfterSec: DEFAULT_RESEND_SECONDS,
      }),
    };
  }
  return {
    kind: 'error',
    error: new AppError(
      'SERVICE_UNAVAILABLE',
      'Le service d’authentification est momentanément indisponible.',
    ),
  };
}
