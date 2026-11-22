"""User-facing French strings of the content context, copied verbatim from TypeScript (ADR-2011).

Sources: `packages/ingestion/src/*`, `packages/services/src/resources/*` and
`packages/services/src/courses/*`. No other module of the content context holds a French literal.
"""

# packages/ingestion/src/chunk.ts
CHUNK_INPUT_INVALID = "Entrée de découpage invalide."
CHUNK_OVERLAP_TOO_LARGE = "Le chevauchement doit être inférieur à la taille cible."
CHUNK_LOCATION_TOO_LONG = "Un emplacement dépasse la longueur du texte."
CHUNK_NO_PASSAGE = "Le texte ne contient aucun passage exploitable."

# packages/ingestion/src/retrieval/select-context.ts
CONTEXT_SELECTION_INVALID = "Les données de sélection du contexte sont invalides."

# packages/ingestion/src/retrieval/format-document.ts
DOCUMENT_CHUNK_INVALID = "Le passage à formater est invalide."

# packages/ingestion/src/retrieval/search-context.ts
RETRIEVAL_SEARCH_INVALID = "La recherche de passages est invalide."
RETRIEVAL_SEARCH_INVALID_DETAIL = "La recherche de passages est invalide : {message}"
RETRIEVAL_LOCATION_UNREADABLE = "Un passage indexé porte un emplacement illisible."
RETRIEVAL_CHUNK_INVALID = "Un passage indexé ne respecte pas le contrat."
RETRIEVAL_UNAUTHENTICATED = "Vous devez être connecté pour rechercher vos passages."
RETRIEVAL_UNAVAILABLE = (
    "La recherche de passages est momentanément indisponible. Vous pouvez continuer sans source."
)

# packages/ingestion/src/embeddings.ts
EMBEDDING_KEY_INVALID = "Le service d’embeddings n’est pas configuré : ajoutez la clé Voyage côté serveur."
EMBEDDING_KEY_REFUSED = "La clé du service d’embeddings est refusée : vérifiez sa configuration."
EMBEDDING_UNAVAILABLE = (
    "Le service d’embeddings est momentanément indisponible : une nouvelle tentative est possible."
)
EMBEDDING_REQUEST_REFUSED = (
    "Le service d’embeddings a refusé la requête : le texte de l’apport est peut-être invalide."
)
EMBEDDING_UNREADABLE = "Le service d’embeddings a renvoyé une réponse illisible."
EMBEDDING_RESPONSE_INVALID = "Le service d’embeddings a renvoyé une réponse invalide."
EMBEDDING_VECTOR_INVALID = "Le vecteur du passage {index} n’a pas {dim} dimensions valides."
EMBEDDING_NOT_ONE_PER_CHUNK = "Le service d’embeddings n’a pas renvoyé un vecteur par passage."
EMBEDDING_CHUNK_MISSING = "Un passage n’a pas reçu de vecteur : le traitement a été interrompu."
EMBEDDING_NOTHING_TO_EMBED = "Aucun passage à vectoriser."

# packages/services/src/resources/limits.ts (BR-APP-02)
UNSUPPORTED_TYPE_AUDIO = "Les fichiers audio et vidéo ne sont pas pris en charge dans cette version."
UNSUPPORTED_TYPE = (
    "Type de fichier non pris en charge : seuls les PDF et les images JPEG, PNG, WebP ou HEIC sont acceptés."
)
UPLOAD_TOO_LARGE = "{subject} ne peut pas dépasser {limit}."
UPLOAD_TOO_MANY_PAGES = "Un PDF ne peut pas dépasser {pages} pages."
NOTE_TOO_LARGE = "Une note ne peut pas dépasser {limit} caractères."
QUOTA_CHAPTER_FULL = "Ce chapitre contient déjà {limit} apports : supprimez-en un avant d’en ajouter."
QUOTA_STORAGE_FULL = (
    "Votre espace de stockage de {limit} Go est plein : supprimez des apports pour libérer de la place."
)
FILE_TOO_LARGE_GENERIC = "Le fichier dépasse les limites autorisées."
FILE_TOO_LARGE_STREAM = "Le fichier dépasse la taille maximale autorisée."

# packages/services/src/resources/detect.ts
PDF_PASSWORD_PROTECTED = "Ce PDF est protégé par un mot de passe : retirez la protection avant de l’envoyer."
PDF_UNREADABLE = "Ce PDF est illisible ou endommagé."
NOT_A_PDF = "Ce fichier n’est pas un PDF."
NOT_AN_IMAGE = "Ce fichier n’est pas une image JPEG, PNG, WebP ou HEIC valide."
CONTENT_TYPE_MISMATCH = "Le contenu du fichier ne correspond pas au type annoncé."
PDF_WITHOUT_PAGE = "Ce PDF ne contient aucune page."

# packages/services/src/resources/{create-upload,finalize,read,rename,retry}.ts
IDEMPOTENCY_KEY_REUSED = "Cette clé d’idempotence a déjà servi pour un autre envoi."
UPLOAD_ALREADY_FINALIZED = "Cet envoi est déjà finalisé : il n’y a rien à reprendre."
NOT_A_FILE_RESOURCE = "Cet apport n’attend pas de fichier."
UPLOAD_EXPIRED = "Cet envoi a expiré ou a été supprimé : recommencez-le."
UPLOAD_EXPIRED_ON_FINALIZE = "Cet envoi a expiré : recommencez-le."
FILE_CHANGED_SINCE_FINALIZE = "Le fichier a changé depuis sa finalisation : envoyez-le de nouveau."
FILE_CHANGED_WHILE_READING = "Le fichier a changé pendant sa lecture : renvoyez-le."
UPLOAD_NOT_RECEIVED = "Le fichier n’a pas été reçu : envoyez-le à l’adresse fournie avant de finaliser."
UPLOAD_INCOMPLETE = "Le fichier reçu est incomplet ({received} octets sur {declared} annoncés) : renvoyez-le."
UPLOAD_VANISHED = "Le fichier a disparu avant d’être lu : renvoyez-le."
UPLOAD_MODIFIED_CONCURRENTLY = "L’envoi a été modifié en parallèle : réessayez."
NO_FILE_FOR_RESOURCE = "Aucun fichier n’est disponible pour cet apport."
RESOURCE_NOT_FOUND = "Apport introuvable."
RESOURCE_CHANGED_SINCE_READ = "Cet apport a changé entre-temps : le titre actuel est restitué."
RESOURCE_MODIFIED_CONCURRENTLY = "L’apport a été modifié en parallèle : réessayez."
VERSION_CURRENT = "Version actuelle : {version}"

# packages/services/src/resources/create-resource.ts
YOUTUBE_URL_INVALID = "Cette adresse n’est pas celle d’une vidéo YouTube."
YOUTUBE_URL_EXPECTED = "Adresse YouTube attendue."

# packages/services/src/resources/suggestions.ts
SUGGESTION_NOT_FOUND = "Suggestion introuvable."
SUGGESTION_DISMISSED = "Cette suggestion a été ignorée."
SUGGESTION_IMPORTED = "Cette suggestion a déjà été importée."
SUGGESTION_WITHOUT_TARGET = "Cette suggestion n’a plus de chapitre ou d’adresse."
MODULE_LOCKED = "Ce module est verrouillé."
MODULE_LOCKED_NOTICE = "Ce module est verrouillé : terminez le quiz du module précédent."
SUGGESTION_NOT_IMPORTED = "La suggestion n’a pas pu être importée."
SUGGESTION_REASON_CHAPTER = "Ressource trouvée pour ce chapitre."
SUGGESTION_REASON_COURSE = "Ressource suggérée par le tuteur."

# packages/services/src/resources/{complete-chapter,module}.ts
CHAPTER_NOT_FOUND = "Chapitre introuvable."
MODULE_NOT_FOUND = "Module introuvable."
PROGRAMME_NOT_ACTIVE = "Le programme n’est pas encore actif."
MODULE_WITHOUT_CHAPTER = "Ce module n’a aucun chapitre."
UNKNOWN_MODULE_STATUS = "Statut de module inconnu."
CHAPTER_NOT_IN_MODULE = "Aucun chapitre dans ce module."

# packages/services/src/courses/{progress,edit-section,report-section,citation-source}.ts
COURSE_NOT_FOUND = "Cours introuvable."
INVALID_IDENTIFIER = "Identifiant invalide : {field}."
SECTION_NOT_FOUND = "Section introuvable."
SECTION_CHANGED_SINCE_READ = "La section a changé depuis votre lecture."
INVALID_SECTION_ID = "Identifiant de section invalide."
INVALID_REQUEST_KEY = "Clé de demande invalide."
REPORT_NOT_STORED = "Signalement non enregistré."
CITATION_NOT_FOUND = "Citation introuvable."
INVALID_CITATION_ID = "Identifiant de citation invalide."

# packages/services/src/tutor-chat/starters.ts (SPEC-610 EF-2)
STARTER_EXPLAIN = "Explique-moi les {label} autrement"
STARTER_EXAMPLE_WITH_NUMBERS = "Donne-moi un exemple chiffré"
STARTER_EXAMPLE_CONCRETE = "Donne-moi un exemple concret"
STARTER_CONFUSION = "{left} ou {right} : quelle différence ?"
DELETED_SOURCE_LABEL = "source supprimée"

# packages/services/src/resources/queries.ts — denyOrMissing
FORBIDDEN_NOT_OWNED = "{subject} ne vous appartient pas."
NOT_FOUND_SUBJECT = "{subject} est introuvable."
SUBJECT_RESOURCE = "Cet apport"
SUBJECT_CHAPTER = "Ce chapitre"
RESOURCE_UPLOADED_NOT_SENT = "Le traitement de l’apport n’a pas pu être lancé : réessayez dans un instant."

# packages/services/src/resources/queries.ts — trigger messages of SPEC-104
LIMIT_PDF = "Ce PDF dépasse la taille ou le nombre de pages autorisés."
LIMIT_IMAGE = "Cette image dépasse la taille autorisée."
LIMIT_CHAPTER = "Ce chapitre a atteint le nombre maximal d’apports."
LIMIT_STORAGE = "Votre espace de stockage est plein."
