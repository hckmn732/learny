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
  GROUP_FULL: { status: 409, title: 'Formation à plusieurs complète' },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, title: 'Requête déjà en cours' },
  ALREADY_SUBSCRIBED: { status: 409, title: 'Abonnement déjà actif' },
  PAYLOAD_TOO_LARGE: { status: 413, title: 'Requête trop volumineuse' },
  IDEMPOTENCY_KEY_REUSED: { status: 422, title: "Clé d'idempotence déjà utilisée" },
  FORMATION_LIMIT_REACHED: { status: 422, title: 'Trois formations actives au plus' },
  EXPORT_LIMIT_REACHED: { status: 422, title: 'Trois exports par jour au plus' },
  EXPORT_EXPIRED: { status: 410, title: 'Export expiré' },
  MODULE_LOCKED: { status: 422, title: 'Module verrouillé' },
  URL_INVALID: { status: 422, title: 'Adresse invalide' },
  URL_BLOCKED_HOST: { status: 422, title: 'Adresse réseau refusée' },
  FETCH_TIMEOUT: { status: 504, title: 'Site trop lent' },
  FETCH_TOO_LARGE: { status: 422, title: 'Page trop volumineuse' },
  FETCH_HTTP_ERROR: { status: 502, title: 'Réponse du site en erreur' },
  FETCH_TOO_MANY_REDIRECTS: { status: 422, title: 'Trop de redirections' },
  FETCH_FAILED: { status: 503, title: 'Site inaccessible' },
  WEB_ROBOTS_DISALLOWED: { status: 422, title: 'Lecture interdite par robots.txt' },
  ROBOTS_DISALLOWED: { status: 422, title: 'Lecture interdite par robots.txt' },
  LOCAL_MODELS_DISABLED: { status: 422, title: 'Modèles locaux désactivés' },
  CREDENTIAL_LIMIT_REACHED: { status: 422, title: 'Dix fournisseurs au plus' },
  CREDENTIAL_NOT_FOUND: { status: 404, title: 'Clé personnelle introuvable' },
  CREDENTIAL_DECRYPT_FAILED: { status: 500, title: 'Clé enregistrée illisible' },
  QUALIFICATION_IN_PROGRESS: { status: 409, title: 'Qualification déjà en cours' },
  AI_MODEL_NOT_QUALIFIED: { status: 422, title: 'Modèle personnel non qualifié' },
  AI_UNAVAILABLE: { status: 422, title: 'IA indisponible pour cette tâche' },
  AI_TASK_FAILED: { status: 503, title: 'Le tuteur n’a pas pu répondre' },
  CADRAGE_INCOMPLETE: { status: 422, title: 'Cadrage incomplet' },
  PROGRAMME_INCOMPLETE: { status: 422, title: 'Programme incomplet' },
  AI_KEY_INVALID: { status: 422, title: 'Clé IA invalide' },
  AI_RATE_LIMITED: { status: 429, title: 'Fournisseur IA saturé' },
  AI_PROVIDER_ERROR: { status: 503, title: 'Fournisseur IA indisponible' },
  AI_TIMEOUT: { status: 504, title: 'Fournisseur IA trop lent' },
  AI_REFUSED: { status: 422, title: 'Réponse refusée par le modèle' },
  AI_CONTEXT_TOO_LONG: { status: 422, title: 'Contexte trop long pour le modèle' },
  INVALID_OUTPUT: { status: 502, title: 'Sortie du modèle invalide' },
  FILES_UNSUPPORTED: { status: 422, title: 'Documents non pris en charge par ce modèle' },
  CITATIONS_WITH_STRUCTURED_OUTPUT: {
    status: 422,
    title: 'Citations incompatibles avec une sortie structurée',
  },
  MOCK_FIXTURE_NOT_FOUND: { status: 500, title: 'Fixture du modèle simulé introuvable' },
  MOCK_STEPS_EXHAUSTED: { status: 500, title: 'Étapes du modèle simulé épuisées' },
  AI_CAP_REACHED: { status: 422, title: "Plafond d'IA du jour atteint" },
  ONBOARDING_AI_REQUIRED: { status: 422, title: "IA requise avant l'étape Rappels" },
  TOOL_NOT_ALLOWED: { status: 403, title: 'Action non autorisée pour cette tâche' },
  SEARCH_UNAVAILABLE: { status: 503, title: 'Recherche web indisponible' },
  RETRY_NOT_YET_ALLOWED: { status: 422, title: 'Nouvelle tentative pas encore possible' },
  UPLOAD_TOO_LARGE: { status: 422, title: 'Fichier trop volumineux' },
  UNSUPPORTED_TYPE: { status: 422, title: 'Type de fichier non pris en charge' },
  QUOTA_EXCEEDED: { status: 422, title: 'Quota atteint' },
  UPLOAD_INCOMPLETE: { status: 422, title: 'Envoi incomplet' },
  NOTE_EMPTY: { status: 422, title: 'Note vide' },
  NOTE_TOO_LARGE: { status: 422, title: 'Note trop longue' },
  PDF_EMPTY_TEXT: { status: 422, title: 'PDF sans texte' },
  PDF_ENCRYPTED: { status: 422, title: 'PDF protégé par mot de passe' },
  PDF_CORRUPTED: { status: 422, title: 'PDF illisible' },
  PDF_TOO_LARGE: { status: 422, title: 'PDF trop volumineux' },
  PDF_TOO_MANY_PAGES: { status: 422, title: 'PDF trop long' },
  RESOURCE_FILE_MISSING: { status: 422, title: 'Fichier de l’apport introuvable' },
  RESOURCE_UNSUPPORTED: { status: 422, title: 'Apport non pris en charge' },
  RESOURCE_URL_MISSING: { status: 422, title: 'Adresse de l’apport introuvable' },
  WEB_EMPTY_TEXT: { status: 422, title: 'Page sans texte lisible' },
  WEB_UNSUPPORTED_CONTENT: { status: 422, title: 'Page non textuelle' },
  WEB_TOO_LARGE: { status: 422, title: 'Page trop longue' },
  YOUTUBE_INVALID_URL: { status: 422, title: 'Adresse YouTube invalide' },
  YOUTUBE_NO_CAPTIONS: { status: 422, title: 'Vidéo sans sous-titres publics' },
  YOUTUBE_UNAVAILABLE: { status: 503, title: 'Vidéo YouTube indisponible' },
  IMAGE_TOO_LARGE: { status: 422, title: 'Image trop volumineuse' },
  IMAGE_UNREADABLE: { status: 422, title: 'Image illisible' },
  IMAGE_EMPTY_TEXT: { status: 422, title: 'Image sans texte lisible' },
  IMAGE_VISION_UNAVAILABLE: { status: 422, title: 'Lecture d’image indisponible' },
  TEXT_EMPTY: { status: 422, title: 'Texte vide' },
  EXTRACTION_FAILED: { status: 422, title: 'Extraction impossible' },
  EMBEDDING_INVALID: { status: 502, title: 'Vecteur de passage invalide' },
  EMBEDDING_UNAVAILABLE: { status: 503, title: 'Service d’embeddings indisponible' },
  EMBEDDING_KEY_INVALID: { status: 422, title: 'Clé d’embeddings invalide' },
  BRICK_INVALID: { status: 422, title: 'Brique invalide' },
  COURSE_NOT_READY: { status: 422, title: 'Cours non prêt' },
  INCOMPLETE_BANK: { status: 422, title: 'Banque incomplète' },
  BRICK_RETIRED: { status: 422, title: 'Brique retirée' },
  GRADED_BY_TUTOR: { status: 422, title: 'Brique corrigée par le tuteur' },
  RESPONSE_INVALID: { status: 422, title: 'Réponse invalide' },
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
  /** Machine-readable reason of a business refusal (`AI_UNAVAILABLE`, SPEC-504 EF-1). */
  reason?: string;
  /** Product link explaining how to restore the service (SPEC-504 EF-2). */
  link?: string;
  /** Personal key that caused the failure, for the qualification flow (SPEC-504 CL-2). */
  credentialId?: string;
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
  readonly errors: { code?: string; path: string; message: string }[] | undefined;
  readonly retryAfterSec: number | undefined;
  readonly reason: string | undefined;
  readonly link: string | undefined;
  readonly credentialId: string | undefined;

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
    this.reason = extra.reason;
    this.link = extra.link;
    this.credentialId = extra.credentialId;
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
    ...((code === 'VALIDATION_FAILED' || code === 'BRICK_INVALID' || code === 'RESPONSE_INVALID') &&
    appError?.errors !== undefined
      ? { errors: appError.errors }
      : {}),
  };
}
