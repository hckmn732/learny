"""User-facing French strings of the problem details (ADR-2011).

Every literal here is copied verbatim from the TypeScript backend. Code references the constant,
never an inline French string.
"""

UNEXPECTED_ERROR = "Une erreur inattendue est survenue. Référence : {request_id}."

# packages/services/src/security/origin-guard.ts (SPEC-208 EF-6, ported by SPEC-2101).
ORIGIN_REJECTED = "Requête refusée : origine non autorisée."

# packages/http/src/route-handler.ts (SPEC-208 EF-2).
RATE_LIMITED = "Vous avez envoyé trop de requêtes. Réessayez dans {seconds} s."

# packages/services/src/security/rate-limit.ts (SPEC-208 EF-1).
SERVICE_UNAVAILABLE = "Service momentanément indisponible."

# packages/http/src/idempotency.ts (SPEC-201 ET-4, ADR-0120).
IDEMPOTENCY_KEY_REQUIRED = (
    "L’en-tête Idempotency-Key est obligatoire (8 à 128 caractères : lettres, chiffres, - et _)."
)

# packages/db/src/repositories/idempotency.ts (SPEC-112 EF-3).
IDEMPOTENCY_KEY_REUSED = "Cette clé d’idempotence a déjà servi pour une autre requête."
IDEMPOTENCY_IN_PROGRESS = "La requête initiale est encore en cours."
IDEMPOTENCY_RESERVATION_NOT_FOUND = "Réservation d’idempotence introuvable."
IDEMPOTENCY_KEY_NOT_FOUND = "Clé d’idempotence réservée introuvable."

# packages/http/src/route-handler.ts authentication steps (SPEC-201).
UNAUTHENTICATED = "Vous devez être connecté pour effectuer cette action."
EMAIL_NOT_CONFIRMED = "Confirmez votre adresse e-mail pour continuer."
