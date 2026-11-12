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

const CONTEXT_TOO_LONG = /context|too long|maximum.*token|prompt is too long|input length/i;
const REFUSAL = /refusal|refused|declined/i;

/** Builds an AI_UNAVAILABLE error with the user message and the settings link of EF-2. */
export function aiUnavailable(
  reason: 'no_subscription_no_key' | 'credential_not_qualified',
  options: { credentialId?: string | undefined } = {},
): AppError {
  return new AppError(
    'AI_UNAVAILABLE',
    'Cette fonction demande un modèle d’IA. Abonnez-vous à l’IA fournie ou ajoutez votre propre clé dans Paramètres › Modèles d’IA.',
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
    if (status === 408 || status === 504 || isAbort(error.cause)) {
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
  return withCode('AI_PROVIDER_ERROR', 'Le fournisseur d’IA est momentanément indisponible.', context, {
    status: 503,
    cause: error,
  });
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
  return new AppError(
    'INVALID_OUTPUT',
    'La sortie du modèle ne respecte pas le schéma attendu.',
    {
      status: 502,
      errors: issues.length > 0 ? issues : [{ path: '', message: 'sortie non conforme' }],
      ...(context.credentialId === undefined ? {} : { credentialId: context.credentialId }),
      cause: error,
    },
  );
}

/** A refusal is a normal model outcome, not a provider failure (ET-7, CL-3). */
export function refused(context: AiErrorContext = {}): AppError {
  return new AppError('AI_REFUSED', 'Le modèle a refusé de produire une réponse.', {
    status: 422,
    ...(context.credentialId === undefined ? {} : { credentialId: context.credentialId }),
  });
}
