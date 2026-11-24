"""French texts of the personal AI keys and of the model settings tab (SPEC-2204, ADR-2011).

Every literal is copied verbatim from the reference implementation: the credential contract
refinements and the limit label, the compatibility reserve messages, and the provider names with
their region warnings.
"""

# --- corps de requête (raffinements que l'OpenAPI ne peut pas exprimer) -------------------------

INVALID_INPUT = "Les données envoyées sont invalides."
API_KEY_REQUIRED = "la clé d’API est obligatoire"
API_KEY_NO_BLANK = "la clé ne contient aucun blanc"
MODEL_ID_PATTERN = "un identifiant de modèle ne contient que lettres, chiffres, `. _ : / -`"
MODEL_IDS_UNIQUE = "les identifiants de modèle doivent être uniques"
BASE_URL_REQUIRED = "l’adresse du point d’accès est obligatoire pour ce fournisseur"
BASE_URL_NOT_ALLOWED = "ce fournisseur n’accepte pas d’adresse personnalisée"

# --- création et suppression d'une clé ---------------------------------------------------------

CHAT_MODEL_REQUIRED = "un modèle de chat est requis"
LOCAL_MODELS_DISABLED = "Les modèles locaux sont désactivés sur cette installation."
CREDENTIAL_LIMIT_REACHED = (
    "Vous avez atteint 10 fournisseurs enregistrés. Supprimez-en un pour en ajouter un autre."
)
CREDENTIAL_DUPLICATE = "Cette clé est déjà enregistrée."
CREDENTIAL_NOT_CREATED = "Identifiant non créé."
CREDENTIAL_ID_NOT_FOUND = "Identifiant introuvable."
URL_NOT_HTTPS_PUBLIC = "l’adresse doit être une URL https publique"
URL_COMPATIBLE_HTTPS = "l’adresse d’un service compatible doit utiliser https"

# --- découverte et qualification ---------------------------------------------------------------

PROVIDER_NO_MODELS = "Le fournisseur n’a retourné aucun modèle disponible."
CHAT_MODEL_UNCONFIRMED = "Le modèle de chat n’a pas confirmé la connexion."
MODEL_ID_INVALID = "Identifiant de modèle invalide."

AI_UNAVAILABLE_DETAIL = (
    "Cette fonction demande un modèle d’IA. Choisissez un modèle de votre propre clé dans "
    "Paramètres › Modèles d’IA."
)

# --- onglet « Modèles d'IA » --------------------------------------------------------------------

MODEL_NOT_FOUND = "Modèle introuvable."
PERSONAL_MODEL_LABEL = "Modèle personnel"

# --- catalogue des fournisseurs (ADR-0154 point 4) ----------------------------------------------

ANTHROPIC_LABEL = "Anthropic"
OPENAI_LABEL = "OpenAI"
MISTRAL_LABEL = "Mistral"
DEEPSEEK_LABEL = "DeepSeek"
COMPATIBLE_LABEL = "Service compatible OpenAI"
LOCAL_LABEL = "Modèle local"

OUTSIDE_EU_NOTE = "Ce fournisseur traite les données hors de l’Union européenne."
MISTRAL_NOTE = "Vérifiez la région de traitement proposée par votre offre."
COMPATIBLE_NOTE = "Vérifiez où ce service traite les données avant de l’utiliser."
LOCAL_NOTE = "Les données restent sur votre machine."

# --- résolution du modèle de tâche (SPEC-709) ---------------------------------------------------

AI_UNAVAILABLE_MODEL = (
    "Cette fonction demande un modèle d’IA. "
    "Choisissez un modèle de votre propre clé dans Paramètres › Modèles d’IA."
)

# --- compatibilité d'une tâche (réserve non bloquante) ------------------------------------------

RESERVE_STRUCTURED_UNRELIABLE = (
    "La sortie structurée de ce modèle n’est pas fiable pour cette tâche. "
    "Vous pouvez le conserver avec réserve."
)
RESERVE_NO_VISION = "Ce modèle ne prend pas en charge les images requises pour cette tâche."
RESERVE_NO_TOOLS = "Ce modèle ne prend pas en charge les appels d’outils requis pour cette tâche."
RESERVE_CHECK_TIMEOUT = (
    "La vérification n’a pas abouti en 15 secondes : le modèle reste utilisable, mais sa "
    "compatibilité avec cette tâche n’est pas confirmée. Vous pouvez relancer la vérification."
)


def reserve_message(code: str) -> str:
    """Message affiché pour un code de réserve, comme `compatibilityReserveMessages`."""
    return {
        "STRUCTURED_UNRELIABLE": RESERVE_STRUCTURED_UNRELIABLE,
        "NO_VISION": RESERVE_NO_VISION,
        "NO_TOOLS": RESERVE_NO_TOOLS,
        "CHECK_TIMEOUT": RESERVE_CHECK_TIMEOUT,
    }[code]


def personal_label(provider_label: str, model_id: str | None) -> str:
    """Libellé d'une option personnelle : « Fournisseur · ma clé », ou le modèle si plusieurs."""
    if model_id is None:
        return f"{provider_label} · ma clé"
    return f"{provider_label} · {model_id}"


# --- appels aux fournisseurs (passerelle réelle, ADR-4005 ; textes de packages/llm/src/errors.ts) ---

AI_KEY_REFUSED = "La clé du fournisseur d’IA est refusée."
AI_KEY_MISSING = "Aucune clé utilisable pour ce fournisseur d’IA."
AI_RATE_LIMITED = "Le fournisseur d’IA limite temporairement les appels."
AI_TIMEOUT = "Le modèle n’a pas répondu dans le délai imparti."
AI_CONTEXT_TOO_LONG = "Le contexte envoyé au modèle dépasse sa fenêtre maximale."
AI_REFUSED = "Le modèle a refusé de produire une réponse."
AI_PROVIDER_UNAVAILABLE = "Le fournisseur d’IA est momentanément indisponible."
AI_PROVIDER_MISCONFIGURED = "Fournisseur d’IA mal configuré : adresse de service absente."
AI_INVALID_OUTPUT = "La sortie du modèle ne respecte pas le schéma attendu."
