"""User-facing French strings of the problem details (ADR-2011).

Every literal here is copied verbatim from the TypeScript backend. Code references the constant,
never an inline French string.
"""

UNEXPECTED_ERROR = "Une erreur inattendue est survenue. Référence : {request_id}."

# packages/services/src/security/origin-guard.ts (SPEC-208 EF-6, ported by SPEC-2101).
ORIGIN_REJECTED = "Requête refusée : origine non autorisée."

# packages/http/src/route-handler.ts (SPEC-201 ET-3, SPEC-2201): request body reading.
PAYLOAD_TOO_LARGE = "La requête dépasse la taille maximale de 1 Mo."
INVALID_JSON_BODY = "Le corps de la requête n’est pas un JSON valide."

# packages/http/src/validate.ts (SPEC-201 EF-1).
INVALID_INPUT = "Les données envoyées sont invalides."

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

# packages/llm/src/credentials/crypto.ts (SPEC-505 ET-1, ported by SPEC-2201).
CREDENTIAL_DECRYPT_FAILED = (
    "La clé enregistrée n’a pas pu être déchiffrée. Supprimez-la puis enregistrez-la à nouveau."
)

# packages/llm/src/mock/select.ts (SPEC-504 ET-6, ported by SPEC-2201).
MOCK_SCENARIO_TRIED = "scénario « {scenario} »"
MOCK_FIXTURE_NOT_FOUND = (
    "Aucune fixture pour la tâche « {task} » et la consigne « {prompt_id} » (candidats : {candidates})."
)

# packages/http/src/route-handler.ts authentication steps (SPEC-201).
UNAUTHENTICATED = "Vous devez être connecté pour effectuer cette action."
EMAIL_NOT_CONFIRMED = "Confirmez votre adresse e-mail pour continuer."

# packages/services/src/auth/gotrue-errors.ts (SPEC-202 ET-2, ported by SPEC-2101).
INVALID_CREDENTIALS = "Adresse e-mail ou mot de passe incorrect."
EMAIL_NOT_CONFIRMED_SIGN_IN = "Vérifiez votre adresse e-mail avant de vous connecter."
RESEND_TOO_SOON = "Vous pourrez renvoyer le lien dans {seconds} secondes."
WEAK_PASSWORD = "Le mot de passe est trop faible."
WEAK_PASSWORD_HINT = "Choisissez un mot de passe plus long."
TOO_MANY_ATTEMPTS = "Trop de tentatives : réessayez dans un instant."
AUTH_UNAVAILABLE = "Le service d’authentification est momentanément indisponible."
AUTH_NOT_CONFIGURED = "Le service d’authentification n’est pas configuré."

# packages/services/src/legal/accept.ts (SPEC-806 ET-3, ET-4, ported by SPEC-2101).
LEGAL_ACCEPTANCE_REQUIRED = "Une nouvelle version des conditions doit être acceptée avant cette action."
LEGAL_VERSIONS_CONFLICT = "Les versions soumises ne sont plus les versions actives. Rechargez la page."

# packages/db/src/storage/paths.ts and signed-urls.ts (SPEC-114, ported by SPEC-2101).
STORAGE_PATH_REFUSED = "Chemin de stockage refusé."
STORAGE_EXPORT_RESERVED = "Seul le job d’export peut déposer une archive."
STORAGE_FILE_NOT_FOUND = "Fichier introuvable."
STORAGE_TOKEN_MISSING = "Jeton d’accès absent."
STORAGE_UPLOAD_SECRET_MISSING = "Signature d’envoi indisponible : secret JWT Supabase absent."
STORAGE_READ_URL_UNAVAILABLE = "URL de lecture indisponible."
STORAGE_UNAVAILABLE = "Stockage indisponible ({status})."
STORAGE_INVALID_FILE_NAME = "Nom de fichier invalide."
STORAGE_EMPTY_FILE_NAME = "Nom de fichier vide."
STORAGE_CONTROL_CHARACTER = "Nom de fichier invalide : caractère de contrôle."
STORAGE_RELATIVE_PATH = "Nom de fichier invalide : chemin relatif ou séparateur."
STORAGE_ENCODED_SEPARATOR = "Nom de fichier invalide : séparateur encodé."
STORAGE_INCOMPLETE_ENCODING = "Nom de fichier invalide : encodage incomplet."
STORAGE_NESTED_ENCODING = "Nom de fichier invalide : encodage imbriqué."
STORAGE_FILE_NAME_TOO_LONG = "Nom de fichier trop long."
STORAGE_USER_ID_INVALID = "Identifiant utilisateur invalide."
STORAGE_RESOURCE_ID_INVALID = "Identifiant de ressource invalide."
STORAGE_EXPORT_ID_INVALID = "Identifiant d’export invalide."
