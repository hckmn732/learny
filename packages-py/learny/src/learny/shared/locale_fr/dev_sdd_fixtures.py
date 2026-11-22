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
