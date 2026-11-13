// Typed errors of the ingestion pipeline (SPEC-509 EF-5, ET-4).
//
// `permanent` tells the job whether a failure must end in `resources.status = 'failed'` (the
// learner can retry) or stay `processing` for the next attempt (a transient provider outage,
// CL-3). The detail is always safe to display: no key, no provider body, no contribution text.
import type { IngestionErrorCode } from '@learny/contracts';
import { AppError } from '@learny/core';

export interface IngestionErrorOptions {
  permanent?: boolean;
  /** HTTP status of the provider response, for the journal only. */
  status?: number;
  cause?: unknown;
}

export class IngestionError extends AppError {
  readonly permanent: boolean;

  constructor(code: IngestionErrorCode, detail: string, options: IngestionErrorOptions = {}) {
    super(code, detail, {
      ...(options.status === undefined ? {} : { status: options.status }),
      ...(options.cause === undefined ? {} : { cause: options.cause }),
    });
    this.permanent = options.permanent ?? true;
  }
}

export function isIngestionError(value: unknown): value is IngestionError {
  return value instanceof IngestionError;
}

/** A missing or unreadable source ends in `failed`: the learner can retry once it is restored. */
export function sourceMissing(): IngestionError {
  return new IngestionError(
    'RESOURCE_FILE_MISSING',
    'Le fichier de cet apport est introuvable. Supprimez-le ou envoyez-le de nouveau.',
  );
}

export function unsupportedKind(kind: string): IngestionError {
  return new IngestionError(
    'RESOURCE_UNSUPPORTED',
    `Le traitement des apports de type « ${kind} » n’est pas encore disponible.`,
  );
}
