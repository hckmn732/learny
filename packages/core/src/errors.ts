// Typed application errors and error catalog (docs/architecture/api.md §1, SPEC-201 ET-2).
// One line per code (status and French title). Later specifications add their business codes here,
// in the same commit as the route that uses them.
export const ERROR_CATALOG = {
  VALIDATION_FAILED: { status: 400, title: 'Données invalides' },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, title: "Clé d'idempotence manquante" },
  INVALID_SIGNATURE: { status: 400, title: 'Signature invalide' },
  UNSUBSCRIBE_TOKEN_INVALID: { status: 400, title: 'Lien de désinscription invalide' },
  UNAUTHENTICATED: { status: 401, title: 'Connexion requise' },
  INVALID_CREDENTIALS: { status: 401, title: 'Identifiants incorrects' },
  FORBIDDEN: { status: 403, title: 'Accès refusé' },
  EMAIL_NOT_CONFIRMED: { status: 403, title: 'Adresse e-mail non vérifiée' },
  ORIGIN_REJECTED: { status: 403, title: 'Origine non autorisée' },
  NOT_FOUND: { status: 404, title: 'Introuvable' },
  CONFLICT: { status: 409, title: 'Conflit' },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, title: 'Requête déjà en cours' },
  ALREADY_SUBSCRIBED: { status: 409, title: 'Abonnement déjà actif' },
  PAYLOAD_TOO_LARGE: { status: 413, title: 'Requête trop volumineuse' },
  IDEMPOTENCY_KEY_REUSED: { status: 422, title: "Clé d'idempotence déjà utilisée" },
  FORMATION_LIMIT_REACHED: { status: 422, title: 'Trois formations actives au plus' },
  EXPORT_LIMIT_REACHED: { status: 422, title: 'Trois exports par jour au plus' },
  EXPORT_EXPIRED: { status: 410, title: 'Export expiré' },
  MODULE_LOCKED: { status: 422, title: 'Module verrouillé' },
  AI_UNAVAILABLE: { status: 422, title: 'IA indisponible pour cette tâche' },
  AI_CAP_REACHED: { status: 422, title: "Plafond d'IA du jour atteint" },
  RETRY_NOT_YET_ALLOWED: { status: 422, title: 'Nouvelle tentative pas encore possible' },
  UPLOAD_TOO_LARGE: { status: 422, title: 'Fichier trop volumineux' },
  UNSUPPORTED_TYPE: { status: 422, title: 'Type de fichier non pris en charge' },
  QUOTA_EXCEEDED: { status: 422, title: 'Quota atteint' },
  UPLOAD_INCOMPLETE: { status: 422, title: 'Envoi incomplet' },
  BRICK_INVALID: { status: 422, title: 'Brique invalide' },
  BRICK_RETIRED: { status: 422, title: 'Brique retirée' },
  RATE_LIMITED: { status: 429, title: 'Trop de requêtes' },
  RESEND_TOO_SOON: { status: 429, title: 'Renvoi trop rapproché' },
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
  errors?: { code?: string; path: string; message: string }[];
  /** Seconds to wait before retrying (`Retry-After` header of 409 and 429 answers). */
  retryAfterSec?: number;
  cause?: unknown;
}

/**
 * Business or technical error with a stable `code`. A code received from the API is kept as is,
 * even when it is not (yet) in the local catalog.
 */
export class AppError extends Error {
  override readonly name: string = 'AppError';
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly errors: { path: string; message: string }[] | undefined;
  readonly retryAfterSec: number | undefined;

  constructor(
    readonly code: ErrorCode | (string & {}),
    readonly detail: string,
    extra: AppErrorExtra = {},
  ) {
    super(detail, extra.cause === undefined ? undefined : { cause: extra.cause });
    this.status = extra.status;
    this.requestId = extra.requestId;
    this.errors = extra.errors;
    this.retryAfterSec = extra.retryAfterSec;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  requestId: string;
  errors?: { code?: string; path: string; message: string }[];
}

type CatalogEntry = { status: number; title: string };

function catalogEntry(code: string): CatalogEntry | undefined {
  return (ERROR_CATALOG as Record<string, CatalogEntry | undefined>)[code];
}

/** `FORMATION_LIMIT_REACHED` → `formation-limit-reached`. */
export function errorCodeToKebab(code: string): string {
  return code.toLowerCase().replaceAll('_', '-');
}

export const PROBLEM_TYPE_BASE = 'https://learny.app/errors/';

/**
 * RFC 9457 body of an error (EF-1). A code outside the catalog or an unexpected exception becomes
 * `INTERNAL_ERROR`; a server error never echoes its message, it only gives the request reference.
 */
export function toProblem(error: unknown, requestId: string): ProblemBody {
  const known = error instanceof AppError ? catalogEntry(error.code) : undefined;
  const appError = error instanceof AppError && known !== undefined ? error : undefined;
  const code = appError?.code ?? 'INTERNAL_ERROR';
  const entry = known ?? ERROR_CATALOG.INTERNAL_ERROR;
  const status = appError?.status ?? entry.status;
  const detail =
    appError !== undefined && status < 500
      ? appError.detail
      : `Une erreur inattendue est survenue. Référence : ${requestId}.`;
  return {
    type: `${PROBLEM_TYPE_BASE}${errorCodeToKebab(code)}`,
    title: entry.title,
    status,
    detail,
    code,
    requestId,
    ...((code === 'VALIDATION_FAILED' || code === 'BRICK_INVALID') && appError?.errors !== undefined
      ? { errors: appError.errors }
      : {}),
  };
}
