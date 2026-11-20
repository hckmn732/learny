// Conversion of every provider failure into a stable AppError (SPEC-504 ET-7).
// Messages never echo a key, a full URL or the content of the input: the provider body is only
// inspected for a few well-known codes, never copied into the error detail.
import { APICallError, NoObjectGeneratedError, TypeValidationError } from 'ai';

import { AppError, isAppError, type ErrorCode } from '@learny/core';

export interface AiErrorContext {
  /** Personal key that produced the failure, forwarded to the qualification flow (CL-2). */
  credentialId?: string | undefined;
  /** Effective model, for the journal line. */
  modelId?: string | undefined;
}

const CONTEXT_TOO_LONG =
  /\bcontext[_ -]?length[_ -]?exceeded\b|\bmaximum context (?:length|window)\b|\b(?:prompt|input) (?:is )?too long\b|\b(?:input|prompt).{0,40}\bmaximum (?:token|tokens|length)\b|\bmax(?:imum)?[_ -]tokens?\b.{0,40}\b(?:input|prompt|context)\b/i;
const REFUSAL = /refusal|refused|declined/i;
const PROVIDER_TEXT_MAX = 240;

export function providerErrorClass(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name;
    if (name !== '' && name !== 'Error') return name;
  }
  if (error !== null && typeof error === 'object') {
    const constructorName = error.constructor.name;
    if (
      typeof constructorName === 'string' &&
      constructorName !== '' &&
      constructorName !== 'Object'
    )
      return constructorName;
  }
  return 'UnknownError';
}

function rawProviderText(error: unknown): string {
  if (APICallError.isInstance(error)) return providerMessage(error);
  if (error instanceof Error) return error.message;
  return '';
}

/** Short provider diagnostic; secrets, URLs and control characters never reach structured logs. */
export function sanitizedProviderText(error: unknown): string {
  let text = Array.from(rawProviderText(error), (char) =>
    char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char,
  )
    .join('')
    .replace(/\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{8,}\b|Bearer\s+[A-Za-z0-9._~+/=-]+/gi, '[redacted]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[url]')
    .replace(/\b(?:api[_-]?key|token|secret|authorization)\b\s*[:=]\s*[^\s,;}]+/gi, '$1=[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > PROVIDER_TEXT_MAX) text = `${text.slice(0, PROVIDER_TEXT_MAX - 1)}…`;
  return text;
}

/** Builds an AI_UNAVAILABLE error with the user message and the settings link of EF-2. */
export function aiUnavailable(
  reason: 'no_model_selected' | 'credential_not_qualified',
  options: { credentialId?: string | undefined } = {},
): AppError {
  return new AppError(
    'AI_UNAVAILABLE',
    'Cette fonction demande un modèle d’IA. Choisissez un modèle de votre propre clé dans Paramètres › Modèles d’IA.',
    {
      status: 422,
      reason,
      link: '/parametres#modeles',
      ...(options.credentialId === undefined ? {} : { credentialId: options.credentialId }),
    },
  );
}

function providerMessage(error: APICallError): string {
  if (typeof error.responseBody === 'string') return error.responseBody.slice(0, 2_000);
  return error.message;
}

function withCode(
  code: ErrorCode,
  detail: string,
  context: AiErrorContext,
  extra: { status?: number; cause?: unknown } = {},
): AppError {
  return new AppError(code, detail, {
    ...(extra.status === undefined ? {} : { status: extra.status }),
    ...(context.credentialId === undefined ? {} : { credentialId: context.credentialId }),
    ...(extra.cause === undefined ? {} : { cause: extra.cause }),
  });
}

function isAbort(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  }
  return false;
}

/** ET-7 — status, provider error class and output validation → the catalogue code. */
export function mapProviderError(error: unknown, context: AiErrorContext = {}): AppError {
  if (isAppError(error)) return error;
  if (isAbort(error)) {
    return withCode('AI_TIMEOUT', 'Le modèle n’a pas répondu dans le délai imparti.', context, {
      status: 504,
      cause: error,
    });
  }
  if (TypeValidationError.isInstance(error) || NoObjectGeneratedError.isInstance(error)) {
    return invalidOutput(error, context);
  }
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === 401 || status === 403) {
      return withCode('AI_KEY_INVALID', 'La clé du fournisseur d’IA est refusée.', context, {
        status: 422,
        cause: error,
      });
    }
    if (status === 429) {
      return withCode(
        'AI_RATE_LIMITED',
        'Le fournisseur d’IA limite temporairement les appels.',
        context,
        { status: 429, cause: error },
      );
    }
    if (status === 408 || status === 504) {
      return withCode('AI_TIMEOUT', 'Le modèle n’a pas répondu dans le délai imparti.', context, {
        status: 504,
        cause: error,
      });
    }
    if (status === 400 && CONTEXT_TOO_LONG.test(providerMessage(error))) {
      return withCode(
        'AI_CONTEXT_TOO_LONG',
        'Le contexte envoyé au modèle dépasse sa fenêtre maximale.',
        context,
        { status: 422, cause: error },
      );
    }
    if (REFUSAL.test(providerMessage(error))) {
      return withCode('AI_REFUSED', 'Le modèle a refusé de produire une réponse.', context, {
        status: 422,
        cause: error,
      });
    }
    return withCode(
      'AI_PROVIDER_ERROR',
      'Le fournisseur d’IA est momentanément indisponible.',
      context,
      { status: 503, cause: error },
    );
  }
  if (error instanceof Error && REFUSAL.test(error.message)) {
    return withCode('AI_REFUSED', 'Le modèle a refusé de produire une réponse.', context, {
      status: 422,
      cause: error,
    });
  }
  return withCode(
    'AI_PROVIDER_ERROR',
    'Le fournisseur d’IA est momentanément indisponible.',
    context,
    {
      status: 503,
      cause: error,
    },
  );
}

/** Zod / AI SDK structured-output failure, with the field errors kept for the caller (CL-5). */
export function invalidOutput(error: unknown, context: AiErrorContext = {}): AppError {
  const issues: { path: string; message: string }[] = [];
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause !== null && typeof cause === 'object' && 'issues' in cause) {
    const raw = (cause as { issues?: unknown }).issues;
    if (Array.isArray(raw)) {
      for (const issue of raw) {
        if (issue !== null && typeof issue === 'object') {
          const path = (issue as { path?: unknown }).path;
          const message = (issue as { message?: unknown }).message;
          if (typeof message === 'string') {
            issues.push({
              path: Array.isArray(path) ? path.join('.') : '',
              message,
            });
          }
        }
      }
    }
  }
  return new AppError('INVALID_OUTPUT', 'La sortie du modèle ne respecte pas le schéma attendu.', {
    status: 502,
    errors: issues.length > 0 ? issues : [{ path: '', message: 'sortie non conforme' }],
    ...(context.credentialId === undefined ? {} : { credentialId: context.credentialId }),
    cause: error,
  });
}

/** A refusal is a normal model outcome, not a provider failure (ET-7, CL-3). */
export function refused(context: AiErrorContext = {}): AppError {
  return new AppError('AI_REFUSED', 'Le modèle a refusé de produire une réponse.', {
    status: 422,
    ...(context.credentialId === undefined ? {} : { credentialId: context.credentialId }),
  });
}
