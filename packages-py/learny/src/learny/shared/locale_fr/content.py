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
    "La recherche dans vos apports est momentanément indisponible : réessayez dans un instant."
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
