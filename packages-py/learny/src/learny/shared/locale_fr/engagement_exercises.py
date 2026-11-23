"""User-facing French content of the practice exercises (ADR-2011).

Copied verbatim from the reference implementation: the deterministic `LLM_MODE=mock` fixture of the
exercise of one notion. The table instruction is the one notion whose label matches « equilibre ...
piece »; every other notion gets the generic text.
"""

from typing import Any

# `tableInstruction` of `ensure-practice-exercise.ts`, parsed by `ExerciseInstructionSchema`.
TABLE_INSTRUCTION: dict[str, Any] = {
    "title": "Saisir une pièce équilibrée",
    "taskMd": (
        "Le 12 novembre 2026, la société **FR01** achète des fournitures de bureau pour **120 €**, "
        "payées immédiatement par virement bancaire. Saisissez la pièce comptable correspondante "
        "(montants hors taxes, sans TVA pour simplifier)."
    ),
    "data": ["Société FR01", "Date de pièce : 12/11/2026", "Devise : EUR"],
    "deliverable": (
        "Un tableau équilibré avec le type de pièce, la clé et le compte de chaque poste, et une "
        "explication de la partie double."
    ),
    "production": {
        "kind": "table",
        "fields": [
            {
                "key": "type",
                "label": "Type de pièce",
                "type": "select",
                "options": [
                    {"value": "SA", "label": "SA · écriture générale"},
                    {"value": "KR", "label": "KR · facture fournisseur"},
                    {"value": "DR", "label": "DR · facture client"},
                ],
            },
            {"key": "date", "label": "Date comptable", "type": "text"},
        ],
        "columns": [
            {
                "key": "cle",
                "label": "Clé de comptabilisation",
                "type": "select",
                "options": [
                    {"value": "40", "label": "40 · débit, compte général"},
                    {"value": "50", "label": "50 · crédit, compte général"},
                    {"value": "31", "label": "31 · crédit, fournisseur"},
                    {"value": "01", "label": "01 · débit, client"},
                ],
            },
            {
                "key": "compte",
                "label": "Compte",
                "type": "select",
                "options": [
                    {"value": "606400", "label": "606400 · Fournitures administratives"},
                    {"value": "512000", "label": "512000 · Banque"},
                    {"value": "401000", "label": "401000 · Fournisseurs"},
                    {"value": "411000", "label": "411000 · Clients"},
                ],
            },
            {"key": "montant", "label": "Montant (€)", "type": "number"},
        ],
        "minRows": 2,
        "maxRows": 4,
        "initialRows": 2,
        "checks": [
            {
                "type": "sum_equal",
                "numberColumn": "montant",
                "groupColumn": "cle",
                "left": ["40", "01"],
                "right": ["50", "31"],
                "leftLabel": "Débit",
                "rightLabel": "Crédit",
                "sideColumnLabel": "Sens",
            }
        ],
    },
    "explanationPrompt": (
        "Pourquoi SAP refuse-t-il d’enregistrer une pièce déséquilibrée ? Une ou deux phrases."
    ),
    "hints": [
        (
            "Il n’y a ni fournisseur ni client à suivre : le paiement est immédiat. Quel type de "
            "pièce pour une écriture de comptabilité générale ?"
        ),
        (
            "La charge augmente : elle va au débit. La banque diminue : elle va au crédit. Sur un "
            "compte général, 40 débite et 50 crédite."
        ),
    ],
    "criteria": [
        {
            "key": "piece-type",
            "label": "Type de pièce",
            "points": 2,
            "description": "Le type attendu est SA, une écriture de comptabilité générale.",
        },
        {
            "key": "charge",
            "label": "Poste de charge",
            "points": 2,
            "description": "Le compte 606400 Fournitures administratives est débité de 120 €.",
        },
        {
            "key": "banque",
            "label": "Poste de banque",
            "points": 2,
            "description": "Le compte 512000 Banque est crédité de 120 €.",
        },
        {
            "key": "equilibre",
            "label": "Pièce équilibrée",
            "points": 2,
            "description": "Le total du débit égale le total du crédit.",
        },
        {
            "key": "explication",
            "label": "Explication",
            "points": 2,
            "description": (
                "L’explication relie la production à la règle de la partie double et à l’équilibre "
                "de la pièce."
            ),
        },
    ],
    "estimatedMinutes": 15,
    "passPoints": 8,
    "sources": [],
}

# `genericInstruction`: the interpolated templates of the other notions.
GENERIC_TITLE = "Mettre en pratique : {label}"
GENERIC_TASK_MD = (
    "Appliquez **{label}** à partir de {definition}. Décrivez la démarche, l’étape décisive et le "
    "résultat attendu."
)
GENERIC_DEFINITION_FALLBACK = "la définition du cours"
GENERIC_DATA = "Notion : {label}"
GENERIC_DELIVERABLE = "Une réponse structurée en une dizaine de lignes."
GENERIC_EXPLANATION = "Expliquez avec vos mots pourquoi votre démarche répond à la consigne."
GENERIC_HINT_RESTATE = "Reformulez la consigne avec « {label} » : que doit-on produire exactement ?"
GENERIC_HINT_SOURCE = "Appuyez-vous sur la définition du cours puis vérifiez chaque étape de votre réponse."
GENERIC_CRITERIA: tuple[dict[str, Any], ...] = (
    {
        "key": "application",
        "label": "Application",
        "points": 3,
        "description": "La production applique {label} au cas proposé.",
    },
    {
        "key": "exactitude",
        "label": "Exactitude",
        "points": 3,
        "description": "Les étapes et le résultat sont exacts.",
    },
    {
        "key": "explication",
        "label": "Explication",
        "points": 2,
        "description": "La démarche est expliquée avec les mots de l’apprenant.",
    },
    {
        "key": "completude",
        "label": "Complétude",
        "points": 2,
        "description": "La réponse couvre toutes les parties de la consigne.",
    },
)
