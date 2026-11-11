// Typed application errors (docs/architecture/api.md §1). SPEC-006 ships the minimal catalog used by
// the web API client; SPEC-201 completes it (one line per code, status and title).
export const ERROR_CATALOG = {
  VALIDATION_FAILED: { status: 400, title: 'Données invalides' },
  NOT_FOUND: { status: 404, title: 'Introuvable' },
  INTERNAL_ERROR: { status: 500, title: 'Erreur interne' },
  INVALID_RESPONSE: { status: 502, title: 'Réponse invalide' },
  NETWORK_ERROR: { status: 503, title: 'Réseau indisponible' },
  SERVICE_UNAVAILABLE: { status: 503, title: 'Service momentanément indisponible' },
} as const satisfies Record<string, { status: number; title: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export interface AppErrorExtra {
  /** HTTP status received, when the error comes from a response. */
  status?: number;
  /** Request identifier given by the server, kept for support. */
  requestId?: string;
  errors?: { path: string; message: string }[];
  cause?: unknown;
}

/**
 * Business or technical error with a stable `code`. A code received from the API is kept as is,
 * even when it is not (yet) in the local catalog.
 */
export class AppError extends Error {
  override readonly name = 'AppError';
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly errors: { path: string; message: string }[] | undefined;

  constructor(
    readonly code: ErrorCode | (string & {}),
    readonly detail: string,
    extra: AppErrorExtra = {},
  ) {
    super(detail, extra.cause === undefined ? undefined : { cause: extra.cause });
    this.status = extra.status;
    this.requestId = extra.requestId;
    this.errors = extra.errors;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
