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
