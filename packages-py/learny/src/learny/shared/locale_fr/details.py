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
LEGAL_VERSIONS_INVALID = "Les versions soumises sont invalides."

# packages/services/src/me.ts, header.ts, sidebar.ts, onboarding/*.ts, parametres-onglets-et-profil.ts
# and ai/qualify-model.ts (SPEC-2201). Every literal is copied verbatim from its TypeScript source.
PROFILE_NOT_FOUND = "Profil introuvable."
PREFERENCES_NOT_FOUND = "Préférences introuvables."
PROFILE_VERSION_CONFLICT = "Le profil a été modifié ailleurs. Rechargez vos réglages."
SETTINGS_STATE_INCONSISTENT = "État des paramètres incohérent."
FORMATION_NOT_FOUND = "Formation introuvable."
CREDENTIAL_NOT_FOUND = "Cette clé personnelle est introuvable."
MODEL_NOT_IN_CREDENTIAL = "Ce modèle ne fait pas partie des modèles de cette clé."
TASK_MODEL_INVALID = "Affectation de modèle invalide."
ONBOARDING_AI_REQUIRED = "Testez une clé personnelle et affectez-la aux cinq tâches."
LEGAL_ACCEPTANCE_STORED_NOT_FOUND = "Acceptation introuvable après insertion."

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

# --------------------------------------------------------------------------------------------------
# Formation context (SPEC-2201), copied verbatim from the TypeScript services it replaces.
# --------------------------------------------------------------------------------------------------
CADRAGE_INVALID_SUGGESTIONS = "Les valeurs des suggestions doivent être uniques."
CADRAGE_MULTI_NEEDS_TWO = "Une question à choix multiple exige au moins deux suggestions."
CADRAGE_COMPLETED = "Le cadrage de cette formation est terminé."
CADRAGE_ALREADY_COMPLETED = "Le cadrage de cette formation est déjà terminé."
CADRAGE_INCOMPLETE = "Précisez d’abord le périmètre et le niveau visé."
CADRAGE_STALE_ANSWER = "Cette question a déjà reçu une réponse."
CADRAGE_NOTHING_TO_RETRY = "Aucune réponse du tuteur à réessayer."
CADRAGE_UNANSWERED = "Le tuteur n’a pas encore répondu à votre message."
PROGRAMME_INCOMPLETE = (
    "Le programme est incomplet ou incohérent. Ajustez-le avec le tuteur avant de le valider."
)
PROGRAMME_STALE = "La proposition a changé : rechargez la version actuelle."
PROGRAMME_CHANGED = "Le programme a changé : rechargez la proposition."
PROGRAMME_ALREADY_PROPOSED = "Un programme est déjà proposé : ajustez-le avec le tuteur."
PROGRAMME_ALREADY_ACTIVE = "Cette formation a déjà un programme actif."
PROGRAMME_NOT_ADJUSTABLE = "Aucune proposition ajustable pour cette formation."
PROGRAMME_ALREADY_VALIDATED = "Ce programme est déjà validé."
PROGRAMME_NOT_ACTIVATABLE = "Cette formation ne peut pas être activée."
PROGRAMME_NO_MODULE = "Ajoutez au moins un module."
PROGRAMME_NOT_ACTIVE = "Le programme n’est pas encore actif."
PROGRAMME_NO_MODULE_PLANNED = "Aucun module n’est planifié pour ce programme."
PROGRAMME_MISSING_DATE = "Le programme n’a pas de date de {label}."
PROGRAMME_MODULE_MISSING = "Le module n’a pas pu être créé."
PROGRAMME_CHAPTER_MISSING = "Le chapitre n’a pas pu être créé."
PROGRAMME_PROPOSAL_MISSING = "Proposition introuvable."
PROGRAMME_ADJUSTMENT_MISSING = "La demande d’ajustement n’a pas pu être créée."
PROGRAMME_VERSION_LABEL = "Version actuelle : {version}"
FORMATION_LIMIT_REACHED = (
    "Trois formations actives au plus. Mettez une formation en pause pour valider celle-ci."
)
FORMATION_LIMIT_REACHED_JOIN = (
    "Trois formations actives au plus. Mettez une formation en pause pour rejoindre celle-ci."
)
FORMATION_CANNOT_PAUSE = "Cette formation ne peut pas être mise en pause."
FORMATION_CANNOT_ARCHIVE = "Cette formation ne peut pas être archivée."
FORMATION_CANNOT_RESUME = "Cette formation ne peut pas être reprise."
FORMATION_CANNOT_ACTIVATE = "Seule une formation active peut devenir la formation courante."
FORMATION_CHANGED = "Cette formation a changé entre-temps. Rechargez la liste."
FORMATION_NOT_CREATED = "Formation non créée."
FORMATION_ONLY_ACTIVE_COPY = "Seule une formation active peut être copiée."
FORMATION_COPY_MISSING = "La copie individuelle n’a pas pu être créée."
GROUP_NOT_FOUND = "Groupe introuvable."
GROUP_MEMBERSHIP_NOT_FOUND = "Appartenance active introuvable."
GROUP_MEMBER_NOT_FOUND = "Membre actif introuvable."
GROUP_MEMBERSHIP_AFTER_LEAVE = "Appartenance introuvable après la sortie."
GROUP_MEMBERSHIP_AFTER_JOIN = "Appartenance introuvable après insertion."
GROUP_MEMBERSHIP_AFTER_REACTIVATION = "Appartenance introuvable après réactivation."
GROUP_MEMBERSHIP_AFTER_CREATE = "Appartenance introuvable après réactivation."
GROUP_ALREADY_EXISTS = "Un groupe existe déjà pour cette formation."
GROUP_CODE_COLLISION = "Le code d’invitation n’a pas pu être généré sans collision ; réessayez."
GROUP_CODE_ATTEMPTS = "Le code d’invitation n’a pas pu être généré après {attempts} essais."
GROUP_FULL = "Le groupe est complet : dix membres au plus."
GROUP_OWNER_CREATE = "Seul le propriétaire peut créer le groupe de sa formation."
GROUP_OWNER_ROTATE = "Seul le propriétaire peut régénérer le code."
GROUP_OWNER_REMOVE = "Seul le propriétaire peut retirer un membre."
GROUP_OWNER_REMOVE_SELF = "Le propriétaire ne peut pas être retiré de son groupe."
GROUP_OWNER_LEAVE = (
    "Le propriétaire ne peut pas quitter son groupe : le transfert de propriété est hors périmètre V1."
)
GROUP_NOT_ACTIVE = "Une formation doit être active pour devenir un groupe."
GROUP_COPY_OWNERSHIP = "La copie individuelle du programme doit appartenir au membre avant sa sortie."
INVITATION_UNKNOWN = "Invitation inconnue ou expirée."
INVITATION_CODE_UNKNOWN = "Code d’invitation inconnu ou expiré."
INVITATION_CODE_FORMAT = "le code d’invitation doit respecter le format LRN-XXXX"
INVALID_FORMATION_ID = "Identifiant de formation invalide."
UUID_EXPECTED = "Un UUID est attendu."
SLUG_ID_COLUMN = "identifiant UUID attendu"
LRN_FORMAT = "format LRN-XXXX attendu"
GROUP_EMPTY_AFTER_ATTACH = "Le groupe n’a pas pu être rattaché à la formation."
NOTION_UNKNOWN_MODULE_STATUS = "Statut de module inconnu."
NOTION_GRAPH_INVALID = "La carte des notions est incomplète."
SEARCH_QUERY_INVALID = "Les données envoyées sont invalides."
INVALID_SUGGESTION = "La source aléatoire a renvoyé une position invalide ({position})."
MISSING_SUGGESTION_CHAR = "La source aléatoire a renvoyé un symbole absent."
RANDOM_BOUND = "La source aléatoire exige une borne entre 1 et 256."
CADRAGE_DONE_FALLBACK = "Merci, j’ai ce qu’il me faut. Générez le programme quand vous voulez."
CADRAGE_AI_UNAVAILABLE = (
    "Aucun modèle d’IA n’est choisi pour le tuteur. "
    "Choisissez un modèle de votre clé dans Paramètres › Modèles d’IA."
)
CADRAGE_AI_TASK_FAILED = "Le tuteur n’a pas pu répondre."
CADRAGE_RATE_LIMITED = "Trop de demandes en peu de temps. Patientez une minute."
PROGRAMME_AI_TASK_FAILED = "Le tuteur n’a pas pu structurer le programme."
PROGRAMME_INVALID_AFTER_CORRECTIONS = "Sortie invalide après corrections."
PROGRAMME_NOT_VALID_JSON = "the answer was not valid JSON"
EXTRACTION_UNSUPPORTED = "Importez un fichier PDF, DOCX, TXT ou MD, ou collez le programme."
EXTRACTION_EMPTY_FILE = "Le fichier importé est vide."
EXTRACTION_BINARY = "Le fichier importé contient des données binaires illisibles."
EXTRACTION_NOT_UTF8 = "Le texte du fichier n’est pas lisible en UTF-8."
EXTRACTION_TEXT_BINARY = "Le fichier importé n’est pas un texte lisible."
EXTRACTION_DOCX_CORRUPT = "Ce document Word est endommagé."
EXTRACTION_DOCX_EMPTY = "Ce document Word ne contient pas de texte lisible."
EXTRACTION_DOCX_COMPRESSION = "Ce document Word utilise une compression non prise en charge."
EXTRACTION_ZIP_CORRUPT = "Ce fichier n’est pas un document Word valide."
EXTRACTION_PDF_CORRUPT = "Ce PDF est illisible ou endommagé."
EXTRACTION_PDF_EMPTY = "Ce PDF ne contient aucun texte lisible."
EXTRACTION_FAILED = "L’extraction du programme importé a échoué."
TEXT_EMPTY = "Le programme importé est vide : ajoutez des modules, chapitres ou notions."
PAYLOAD_TOO_LARGE_TEXT = "Le programme importé dépasse 200 000 caractères."
PAYLOAD_TOO_LARGE_FILE = "Le fichier importé dépasse 700 ko."
FIELD_INVALID = "Champ « {field} » invalide : {message}"
PROGRAMME_DATE_START = "début"
PROGRAMME_DATE_END = "fin"
PROGRAMME_END_BEFORE_START = "La date de fin doit être postérieure à la date de début."
PROGRAMME_DUPLICATE_NOTION = "La notion « {label} » est présente deux fois dans ce chapitre."
PROGRAMME_DUPLICATE_MODULE_POSITION = "Deux modules partagent la même position."
PROGRAMME_DUPLICATE_CHAPTER_POSITION = "Deux chapitres partagent la même position."
PROGRAMME_GENERATE_MESSAGE = (
    "Conçois le programme complet de la formation « {title} » à partir du cadrage figé."
)
PROGRAMME_IMPORT_MESSAGE = (
    "Structure ce programme importé : conserve les modules, chapitres et notions du document, "
    "sans en inventer."
)
PROGRAMME_IMPORT_SOURCE = "programme-collé"
PROGRAMME_IMPORT_TITLE = "Programme importé par l’apprenant"
SEARCH_TOO_SHORT = "Trop petit : une chaîne de 2 caractères au minimum est attendue"
SEARCH_TOO_LONG = "Trop grand : une chaîne de 100 caractères au maximum est attendue"
MODULE_LABEL = "Module {position} · {title}"
ELLIPSIS = "…"
WEB_SEARCH_UNAVAILABLE = "Recherche web indisponible : la proposition repose sur le cadrage seul."
PROGRAMME_PROPOSAL_VERSION_TITLE = "Version {version} de la proposition"

# packages/services/src/resources/storage.ts — the Storage JWT secret is missing.
STORAGE_ACCESS_SECRET_MISSING = "Accès au stockage indisponible : secret JWT absent."

# --------------------------------------------------------------------------------------------------
# Job use cases of SPEC-2207, copied verbatim from the TypeScript services they replace.
# --------------------------------------------------------------------------------------------------
USER_ID_INVALID = "Identifiant utilisateur invalide."
MODULE_NOT_FOUND = "Module introuvable."
