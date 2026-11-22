# SPEC-2204 — acceptance

Branche `spec/SPEC-2204-domaine-tuteur-sse`, worktree `learny-wt-SPEC-2204`, base `65ebfec1`.
Statut : **en cours** (les douze opérations sont livrées et servies par Python ; reste la page de
démonstration, l'e2e et la clôture). Chaque critère dit ce qui est prouvé et ce qui reste.

- **CA-1 — les 12 opérations en `py`** — ✅ 12/12. Les cinq opérations de conversation et les sept
  `me.ai.*` sont servies par Python (`api/ownership.yaml`) ; les handlers et la bascule sont dans le
  même commit que `handlers/tutor.py`, et `test_handlers.py` (`py_operations == HANDLERS`, 3 cas)
  passe. La matrice entrée → cas d'usage → règles → tables → tests est dans `scope.md`.
- **CA-2 — parité, zéro divergence** — ✅ sur le domaine et sur les lectures BYOK. Le groupe `tutor`
  est enregistré contre Hono puis rejoué contre la façade : **2 scénarios, 0 divergence**
  (`me.ai.credentials.list`, `me.ai.models.get`). La chaîne conversations reste non enregistrable
  (harnais sans amorçage de cours) et sa preuve est l'oracle `api/oracles/vectors/tutor.json` (50 cas
  d'égalité stricte) plus l'intégration de la façade. Détail : `parity.md`.
- **CA-3 — chaque test TS a un jumeau pytest** — ⏳ 13 des 16 lignes de `scope.md` sont faites. Cette
  tranche ajoute les cinq jumeaux `me.ai.*` (22 cas unitaires + 26 cas d'intégration). Restent
  `loop.test.ts` (agent loop non porté, SPEC-2205/2207) et les deux e2e (page à venir).
- **CA-4 — contrats import-linter** — ✅ `uv run lint-imports` → 1 kept, 0 broken.
- **CA-5 — e2e à travers la façade** — ⏳ pas encore de spec e2e ; les opérations sont servies par
  Python et prouvées par l'intégration (ordre SSE, en-têtes, 404, RLS).

## Prouvé dans cette tranche BYOK

| Preuve | Commande | Résultat |
|---|---|---|
| Contexte BYOK, projections et batterie de compatibilité | `uv run pytest packages-py/learny/tests/unit/tutor/test_tutor_ai_models.py -q` | 22 passed |
| Clés personnelles sur la base locale (RLS, création, listage, suppression, découverte, qualification, erreurs) | `flock /tmp/learny-sdd-db.lock uv run pytest packages-py/learny/tests/integration/tutor/test_tutor_byok.py -q` | 26 passed |
| Intégration du contexte tutor (conversations, SSE, Teste-moi, BYOK) | `flock /tmp/learny-sdd-db.lock uv run pytest packages-py/learny/tests/integration/tutor -q` | 55 passed |
| Suite unitaire complète | `uv run pytest packages-py/learny/tests/unit apps/api-py/tests/unit -q` | 3480 passed |
| Handlers = opérations `py` | `uv run pytest apps/api-py/tests/unit/test_handlers.py -q` | 3 passed |
| Parité du groupe `tutor` | `corepack pnpm parity:record --group tutor --target http://127.0.0.1:3112` puis `corepack pnpm parity:check --group tutor --target http://127.0.0.1:3113` | 2 scénarios, 0 divergence |
| Lint / types / frontières | `uv run ruff check .`, `uv run ruff format --check packages-py apps`, `uv run mypy packages-py apps`, `uv run lint-imports` | vert |
| Inventaire à jour | `corepack pnpm exec tsx tools/migration/inventory.mjs --check` | « Inventory up to date: 217 operations » |

Chiffrement aller-retour : `test_the_stored_key_is_encrypted_with_the_row_envelope` déchiffre la
colonne `encrypted_key` avec `decrypt_secret` et l'AAD `learny:ai_credentials:<credId>:<userId>`, et
vérifie que la valeur retrouvée est la clé factice, que `key_last4`, l'empreinte et le préfixe sont
stockés, et que le DTO ne contient ni clé ni chiffré.

## Prouvé dans la tranche runtime (rappel)

| Preuve | Commande | Résultat |
|---|---|---|
| Domaine identique à l'oracle TypeScript (strict) | `uv run pytest packages-py/learny/tests/unit/tutor -q` | 50 passed |
| Conversations, flux SSE et Teste-moi sur la base locale | `flock /tmp/learny-sdd-db.lock uv run pytest packages-py/learny/tests/integration/tutor -q` | 29 passed (avant BYOK) |
| Comparateur SSE du harnais de parité | `corepack pnpm exec vitest run tools/parity/test/unit/event-stream.test.ts` | 4 passed |

## Latence du premier chunk

Mesurée à travers la façade réelle (route FastAPI, pipeline, handler, `StreamingResponse`) sur la
base locale et le modèle simulé, en pilotant l'application par l'interface ASGI pour horodater chaque
trame produite :

| Mesure | Valeur | Seuil du test |
|---|---|---|
| Premier événement `start` reçu par le client | **50,0 ms** | < 500 ms |

Test : `packages-py/learny/tests/integration/tutor/test_tutor_stream_facade.py::test_the_first_chunk_arrives_within_the_bound`
(`uv run pytest … -s -k first_chunk` affiche la valeur).

## Ordre des événements SSE

`test_tutor_stream_facade.py::test_the_route_answers_the_ai_sdk_stream_with_the_oracle_order` compare
la liste ordonnée des types de trames reçues par le client à celle de `sse.chat` de
`api/oracles/vectors/tutor.json`, vérifie `content-type`, `cache-control`,
`x-vercel-ai-ui-message-stream`, `x-request-id`, `x-served-by`, et la terminaison exacte
`data: [DONE]\n\n`.

## Écarts assumés et décisions

- **ADR-2026** — copie verbatim de `looksInjection`, `asksForTest` et `mockGradeScenario` dans
  `tools/oracles/tutor-helpers.ts`.
- **ADR-2027** — `learny_api/sse.py` créé faute de writer SSE Python.
- **ADR-2028** — `me.ai.credentials.qualify` porte le protocole atteignable par la route (sonde de
  connexion ou compatibilité par tâche) ; la batterie de treize briques, `markCredentialStatus` et
  `stopAfterInvalidBrick` restent hors tranche (page de démonstration et SPEC-2207), sans changement
  visible pour le client.
- **ADR-2029** — `LlmGateway.session` et `MockSession` : une session partage le curseur d'une fixture
  entre ses appels, comme `LearnMockModel` ; sans cela la sonde `vision` de `light` réutiliserait la
  sortie structurée et produirait une fausse réserve `NO_VISION`.
- `apply_learning_result` comme unique écrivain de la maîtrise ; le service Teste-moi ne touche
  `notion_states` que pour replacer une notion ratée dans le quiz global.
- Une conversation ou une clé d'autrui est un 404 : la lecture passe par RLS, puis le service rend
  `NOT_FOUND`/`CREDENTIAL_NOT_FOUND` avec le libellé `locale_fr`.
- Le message apprenant est écrit et `tutor/question-asked` émis avant l'appel modèle ; le message du
  tuteur n'est écrit qu'après un flux complet.
- La découverte vivante (`discover_provider_models`, httpx 15 s) n'est pas exercée par la suite
  (aucun fournisseur réel, ADR-0048) ; le mode mock est la seule configuration servie tant que les
  adaptateurs vivants n'existent pas.
- `LLM_MODE=mock` reste la seule valeur acceptée au démarrage (`build_llm`) : les sondes de
  qualification passent par le gateway simulé et ne déchiffrent donc pas la clé ; le code
  `CREDENTIAL_DECRYPT_FAILED` reste déclaré au contrat et deviendra atteignable avec les adaptateurs
  vivants.

## Reste à faire (prochaine session)

1. La page `/_dev/sdd/SPEC-2204` et `apps/web/e2e/specs/p22/spec-2204.spec.ts`.
2. `node tools/sdd/validate.mjs SPEC-2204` puis `complete.mjs SPEC-2204 --no-merge --no-push`.
