// Job errors: permanent (business) errors are never retried, the others are (ET-5).
import { NonRetriableError } from 'inngest';

export type JobErrorCode = 'VALIDATION_FAILED' | 'IDEMPOTENCY_CONFLICT';

export class PermanentJobError extends NonRetriableError {
  readonly code: JobErrorCode;

  constructor(code: JobErrorCode, message: string) {
    super(message);
    this.name = 'PermanentJobError';
    this.code = code;
  }
}

export class TransientJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientJobError';
  }
}

export function isPermanentError(error: unknown): boolean {
  return error instanceof NonRetriableError;
}

// Safe projection of an error for logs and API answers: never the input nor the stack.
export function errorCode(error: unknown): string {
  if (error instanceof PermanentJobError) return error.code;
  if (error instanceof TransientJobError) return 'TRANSIENT';
  return 'INTERNAL';
}
