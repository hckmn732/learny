"""Sample data of the SDD demonstration pages (SPEC-110, SPEC-114, SPEC-1203).

Copied from `packages/api-routes/src/dev-sdd/spec-110.ts` and from the static answers of
`implementations/dev-sdd.ts`. Only the labels and identifiers live here.
"""

CREDENTIAL_ANTHROPIC_LABEL = "Clé Anthropic d’Alex"
CREDENTIAL_ANTHROPIC_LAST4 = "a1b2"
CREDENTIAL_DEEPSEEK_LABEL = "Clé DeepSeek (hors UE)"
CREDENTIAL_DEEPSEEK_LAST4 = "c3d4"
SUBSCRIPTION_PERIOD_END = "2026-12-11T12:20:00.000Z"
SUBSCRIPTION_CUSTOMER = "cus_demo_alex"

CREDENTIALS = (
    {
        "provider": "anthropic",
        "label": CREDENTIAL_ANTHROPIC_LABEL,
        "keyLast4": CREDENTIAL_ANTHROPIC_LAST4,
        "status": "qualified",
        "outsideEu": False,
    },
    {
        "provider": "deepseek",
        "label": CREDENTIAL_DEEPSEEK_LABEL,
        "keyLast4": CREDENTIAL_DEEPSEEK_LAST4,
        "status": "failed",
        "outsideEu": True,
    },
)

TASKS = (
    {
        "task": "programme",
        "modelId": "claude-sonnet-4-5-20250929",
        "usable": True,
        "credentialLabel": CREDENTIAL_ANTHROPIC_LABEL,
        "credentialStatus": "qualified",
    },
    {
        "task": "course",
        "modelId": "claude-sonnet-4-5-20250929",
        "usable": True,
        "credentialLabel": CREDENTIAL_ANTHROPIC_LABEL,
        "credentialStatus": "qualified",
    },
    {
        "task": "gaps",
        "modelId": "deepseek-chat",
        "usable": False,
        "credentialLabel": CREDENTIAL_DEEPSEEK_LABEL,
        "credentialStatus": "failed",
    },
    {
        "task": "tutor",
        "modelId": "claude-haiku-4-5-20251001",
        "usable": True,
        "credentialLabel": CREDENTIAL_ANTHROPIC_LABEL,
        "credentialStatus": "qualified",
    },
    {
        "task": "light",
        "modelId": None,
        "usable": False,
        "credentialLabel": None,
        "credentialStatus": None,
    },
)

SUBSCRIPTION = {
    "status": "active",
    "currentPeriodEnd": SUBSCRIPTION_PERIOD_END,
    "stripeCustomerId": SUBSCRIPTION_CUSTOMER,
}

DEMO_USER = "11111111-1111-4111-8111-111111111111"
DEMO_RESOURCE = "22222222-2222-4222-8222-222222222222"
DEMO_FILE_NAME = "guide.pdf"

DEPENDENCIES = (
    "@learny/api-client",
    "@learny/bricks",
    "@learny/contracts",
    "@learny/core",
    "@learny/domain",
    "@learny/i18n",
    "@learny/learning-engine",
    "@learny/ui",
)

# SPEC-101 - the sample of the unaccented search function.
UNACCENT_SAMPLE = "Écriture comptable"
UNACCENT_EXPECTED = "Ecriture comptable"

# SPEC-102 - the demonstration account the page creates then removes.
DEMO_102_EMAIL_PATTERN = "spec102-%@test.learny.test"
DEMO_102_FIRST_NAME = "Alex"
DEMO_102_LAST_NAME = "Perrin"
DEMO_102_TIMEZONE = "Europe/Paris"

# SPEC-109 - the three notifications of the delivery demonstration (EF-6).
DEMO_DIGEST = {
    "type": "daily_digest",
    "title": "Votre programme du jour",
    "body": "Trois activités vous attendent aujourd’hui, dont un quiz de validation.",
    "href": "/agenda",
    "icon": "calendar",
    "dedupeKey": "digest:2026-11-11",
    "createdAt": "2026-11-11T07:00:00.000Z",
}
DEMO_GAP = {
    "type": "new_gap",
    "title": "Nouvelle lacune : TVA intracommunautaire",
    "body": "Deux réponses confondent le taux normal et le taux réduit. Une révision est proposée.",
    "href": "/formations/finance/lacunes",
    "icon": "alert-triangle",
    "dedupeKey": "gap:2026-11-11",
    "createdAt": "2026-11-11T09:30:00.000Z",
}
DEMO_WEEKLY_REVIEW = {
    "type": "weekly_review",
    "title": "Votre bilan de la semaine",
    "body": "Quatre séances terminées, une notion validée et deux révisions dues demain.",
    "href": "/bilan",
    "icon": "chart-line",
    "dedupeKey": "weekly:2026-11-11",
    "createdAt": "2026-11-11T10:15:00.000Z",
}
DEMO_NOTIFICATIONS = (DEMO_DIGEST, DEMO_GAP, DEMO_WEEKLY_REVIEW)
DEMO_DIGEST_READ_AT = "2026-11-11T08:30:00.000Z"
DEMO_DIGEST_SENT_AT = "2026-11-11T07:00:00.000Z"
DEMO_QUIET_SCHEDULED_FOR = "2026-11-12T07:00:00.000Z"
NO_SUBSCRIPTION = "no_subscription"

# SPEC-505 - the two error texts of the credential page.
DEMO_SEED_MISSING = "Jeu de démonstration absent : lancer `pnpm db:seed:demo`."
DEMO_UNAVAILABLE = "Démonstration indisponible."

# SPEC-505 - the seeded account whose credentials are listed.
DEMO_USER_EMAIL = "alex.perrin@demo.learny.test"

# SPEC-501 / SPEC-505 - the action pages of the demonstration account.
DEMO_ABSENT = "Jeu de démonstration absent."
CHOOSE_PROVIDER_MODEL = "Choisissez un fournisseur et un nom de modèle."
KEY_ID_MISSING = "Identifiant de clé manquant."

# SPEC-002 - the `file` a scanned secret is reported under (`scanText(text, 'saisie')`).
SECRET_SCAN_SOURCE = "saisie"

# SPEC-103 / SPEC-2302 - the programme factory of the demonstration pages (port of
# `packages/db/src/testing/programme.ts`).
PROGRAMME_TITLE = "Formation de démonstration"
MODULE_TITLE = "Partie {position}"
CHAPTER_TITLE = "Chapitre {module}.{chapter}"
NOTION_LABEL = "Notion {module}.{chapter}.{notion}"
NOTION_DEFINITION = "Définition courte {position}"
COURSE_SECTION_ANCHOR = "section-{chapter}-{position}"
COURSE_SECTION_TITLE = "Section {position}"
COURSE_SECTION_CONTENT = "Contenu de la section {position}."

# SPEC-103 - the programme tree and the constraint probes of the formations page.
SPEC103_CL3_MESSAGE = "Réorganisation en transaction acceptée"
SPEC103_INCONSISTENT_NOTION = "Notion incohérente"
SPEC103_FIRST_NOTION_LABEL = "Écriture de régularisation"
SPEC103_FIRST_NOTION_DEFINITION = "Passage d'écriture comptable"
SPEC103_SECOND_NOTION_LABEL = "Équilibre d’une pièce"
SPEC103_SECOND_NOTION_DEFINITION = "Débit et crédit"
SPEC103_FTS_QUERY = "ecriture"

# SPEC-104 - the note, its three passages and the limit probes of the resources page.
SPEC104_NOTE = "Clés de comptabilisation : 40 = débit, 50 = crédit ? À vérifier"
SPEC104_RESOURCE_TITLE = "Clés de comptabilisation"
SPEC104_PASSAGES = ("Clés de comptabilisation", "40 = débit, 50 = crédit", "? À vérifier")
SPEC104_QUERY = "clé débit"
SPEC104_LONG_NOTE_TITLE = "Note trop longue"
SPEC104_LONG_PDF_TITLE = "Guide trop long"
SPEC104_PDF_FILE = "guide.pdf"
SPEC104_PENDING_TITLE = "Suggestion sans URL"
SPEC104_FILLER_TITLE = "Contribution {index}"
SPEC104_FILLER_CONTENT = "Contenu {index}"
SPEC104_EXTRA_TITLE = "Contribution de trop"
SPEC104_EXTRA_CONTENT = "Contenu de trop"

# SPEC-105 - the two course versions, the corrected section, the citation and the discussion.
SPEC105_SOURCE_LABEL = "Guide FI, p. 4"
SPEC105_DELETED_SOURCE = "source supprimée"
SPEC105_SECTION_ANCHOR = "en-tete-de-piece"
SPEC105_SECTION_TITLE = "L’en-tête de pièce"
SPEC105_SECTION_CONTENT = "L’en-tête de pièce regroupe les informations communes à toutes les écritures."
SPEC105_SECTION_EDIT = "L’en-tête de pièce précise la date, le journal et la pièce."
SPEC105_SECTION_EDIT_LAST = "L’en-tête de pièce précise la date, le journal, la pièce et le libellé."
SPEC105_RESOURCE_TITLE = "Guide FI"
SPEC105_RESOURCE_TEXT = "Clés de comptabilisation : 40 = débit, 50 = crédit ?"
SPEC105_CHUNK_TEXT = "Clés de comptabilisation"
SPEC105_CONVERSATION_TITLE = "Comment lire une clé ?"
SPEC105_QUESTION = "Comment reconnaître une clé de comptabilisation ?"
SPEC105_ANSWER = "La clé se lit dans le plan comptable : le premier chiffre indique la classe."

# SPEC-106 - the thirteen bricks, the three versions of the activity and the graded attempt.
SPEC106_STATEMENT = "Énoncé {version}"
SPEC106_CORRECTED_STATEMENT = "Énoncé 1 corrigé"
SPEC106_EXPLANATION = "Compte fournisseur."
SPEC106_PARTIAL_EXPLANATION = "Réponse juste mais incomplète."
SPEC106_CRITERION_COMMENT = "Compte fournisseur identifié."
SPEC106_RESPONSE = "La clé 401 est un compte fournisseur."

# SPEC-107 - the second learner of the isolation probe.
SPEC107_FOREIGN_FORMATION = "Formation privée"
SPEC107_FOREIGN_FIRST_NAME = "Béatrice"
SPEC107_EVIDENCE_CHOSEN = "Compte de résultat"
SPEC107_EVIDENCE_EXPECTED = "Compte fournisseur"
SPEC115_MISSING_FIRST_NAME = "—"

# SPEC-108 - the five slots, the consent action, the daily activity and the milestones.
SPEC108_ORIGIN_TITLE = "Lecture du cours"
SPEC108_DONE_TITLE = "Quiz de validation · module 1"
SPEC108_MISSED_TITLE = "Exercice pratique"
SPEC108_CANCELLED_TITLE = "Révision du soir"
SPEC108_ACTION_SUMMARY = "Votre séance d’hier est proposée demain à 18 h : un accord est attendu."

# SPEC-111 - the shared programme, its group and the deterministic invitation code.
SPEC111_PROGRAMME_TITLE = "Programme partagé"
SPEC111_INVITE_CODE = "LRN-AB23"

# SPEC-112 - the private search fixture, the exports, the acceptances and the idempotency states.
SPEC112_PROGRAMME_TITLE = "SAP S/4HANA Finance"
SPEC112_DESCRIPTION = "Formation à la trésorerie, au budget et aux encaissements."
SPEC112_FIRST_NOTION_LABEL = "Trésorerie prévisionnelle"
SPEC112_FIRST_NOTION_DEFINITION = "Anticiper les encaissements et les décaissements de la trésorerie."
SPEC112_SECOND_NOTION_LABEL = "Budget annuel"
SPEC112_SECOND_NOTION_DEFINITION = "Le budget pilote les dépenses."
SPEC112_SECTION_TITLE = "Le cycle de trésorerie"
SPEC112_SECTION_CONTENT = (
    "<script>alert(1)</script>La trésorerie suit les encaissements et les décaissements. <b>Texte sûr</b>"
)
SPEC112_QUERY = "tresorerie"
SPEC112_FOREIGN_TITLE = "Trésorerie confidentielle de Bob"
SPEC112_FOREIGN_PROGRAMME_TITLE = "Trésorerie confidentielle de Bob"
SPEC112_FOREIGN_SECTION_TITLE = "Le secret de Bob"
SPEC112_FOREIGN_SECTION_CONTENT = "La trésorerie de Bob reste privée et ne doit jamais apparaître."
SPEC112_EXPORT_QUEUED_RESPONSE = {"exportId": "{export}", "status": "queued"}
SPEC112_REUSED_RESPONSE = {"code": "IDEMPOTENCY_KEY_REUSED"}

# SPEC-113 - the RLS catalogue and the three-learner matrix.
SPEC113_PROGRAMME_TITLE = "Programme de démonstration RLS"
SPEC113_INVITE_CODE = "LRN-RL34"
SPEC113_PRIVATE_RESOURCE_TITLE = "Note privée de A"
SPEC113_PRIVATE_RESOURCE_CONTENT = "Contenu privé de A"
SPEC113_CATEGORIES = (
    ("shared-programme", 7),
    ("personal", 46),
    ("service", 7),
)

# SPEC-115 - the demonstration dataset measured by the page (port of `demo-fixtures.ts`).
SPEC115_AGENDA_DAYS = (
    {"date": "2026-11-09", "label": "lundi 9 novembre"},
    {"date": "2026-11-10", "label": "mardi 10 novembre"},
    {"date": "2026-11-11", "label": "mercredi 11 novembre"},
    {"date": "2026-11-12", "label": "jeudi 12 novembre"},
    {"date": "2026-11-13", "label": "vendredi 13 novembre"},
)
SPEC115_FORMATIONS = (
    ("SAP S/4HANA Finance", "active", 38),
    ("Gestion de projet agile", "active", 83),
    ("Python pour l'analyse de données", "programme_proposed", 0),
    ("Excel pour l'analyse financière", "completed", 100),
    ("Anglais professionnel B2", "completed", 100),
)
SPEC115_EXPECTED_SAP_MODULES = 7
SPEC115_EXPECTED_SAP_CHAPTERS = 24
SPEC115_EXPECTED_SAP_NOTIONS = 48
SPEC115_EXPECTED_ACTIVE = 3
SPEC115_EXPECTED_COMPLETED = 2
SPEC115_EXPECTED_GROUP_MEMBERS = 3
SPEC115_EXPECTED_AGENDA_SLOTS = 23
SPEC115_EXPECTED_AGENDA_DAYS = 5
SPEC115_EXPECTED_UNREAD = 3
SPEC115_PROFILE_SOURCE = {
    "screen": "SCR-03",
    "file": "Main.dc.html",
    "element": "série « 12 jours », compte Europe/Paris",
}
SPEC115_FORMATION_SOURCE = {
    "screen": "SCR-03",
    "file": "Main.dc.html",
    "element": ("carte SAP : 38 %, module 3 sur 7, quiz à repasser aujourd’hui 14:00, fin 11 déc. 2026"),
}
SPEC115_NOTIFICATION_SOURCE = {
    "screen": "SCR-03",
    "file": "Main.dc.html",
    "element": "panneau Notifications (8 éléments, 3 non lues)",
}
SPEC115_CHECK_LABELS = {
    "sap.modules": "Modules SAP",
    "sap.notions": "Notions SAP",
    "formations.active_or_proposed": "Formations en cours ou proposées",
    "formations.completed": "Formations terminées",
    "group.members": "Membres du groupe",
    "agenda.slots": "Créneaux de la semaine",
    "agenda.days": "Jours de l’agenda",
    "notifications.unread": "Notifications non lues",
}
