// Transport errors (SPEC-204 ET-5, CL-2). A transient error is retried by the job runner; a
// rejected message never is. Neither carries the recipient address.
export class EmailTransientError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'EmailTransientError';
    this.status = status;
  }
}

export class EmailRejectedError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'EmailRejectedError';
    this.status = status;
  }
}

export function isTransientEmailError(error: unknown): error is EmailTransientError {
  return error instanceof EmailTransientError;
}

export function isRejectedEmailError(error: unknown): error is EmailRejectedError {
  return error instanceof EmailRejectedError;
}
