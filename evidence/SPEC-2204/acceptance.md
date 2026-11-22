# SPEC-2204 — acceptance

Branche `spec/SPEC-2204-domaine-tuteur-sse`, worktree `learny-wt-SPEC-2204`, base `65ebfec1`.
Commits de clôture : `7c393e37` (page de démonstration) et `3514a0b9` (e2e et inventaire).
Statut : **clôturée** — les cinq critères de `specs/p22-python-domaines/SPEC-2204-domaine-tuteur-sse.md`
§11 sont cochés avec leur preuve, et `node tools/sdd/validate.mjs SPEC-2204` passe ses huit étapes
(`checks.json`, `summary.md`, captures et vidéos collectées dans ce dossier).

## Critères d'acceptation

- **CA-1 — opérations du périmètre à `py`, cas d'usage des jobs portés, matrice complète** — ✅
  12/12 opérations servies par Python et basculées dans `api/ownership.yaml` (5 conversations et 7
  `me.ai.*`), handlers livrés dans le même commit que la bascule et couverts par
  `apps/api-py/tests/unit/test_handlers.py` (`py_operations == HANDLERS`, 3 cas verts). La matrice
  entrée → cas d'usage → règles → tables → tests est `scope.md`, et `api/inventory.json` référence
  désormais l'e2e pour ces opérations (`--check` : « Inventory up to date: 217 operations »).
  Aucune des douze opérations n'appelle un cas d'usage de job : les deux jobs `tutor` du plan P22
  (`prepare_question_bank`, `process_question_bank_jobs`, lignes 139 et 150 du plan) ne sont
  atteignables que par les crons et l'événement `course/generated`, et passent au worker avec la
  bascule des jobs (SPEC-2207) ; les deux autres cas d'usage que le plan liste pour cette phase
  sont déjà portés et testés par les tranches qui possèdent leur contexte (`generate_course` →
  SPEC-2203, `prepare_remediation` → SPEC-2202).
- **CA-2 — parité contractuelle, zéro divergence inexpliquée** — ✅ Le groupe `tutor` est enregistré
  contre Hono puis rejoué contre la façade : **2 scénarios, 0 divergence**
  (`me.ai.credentials.list`, `me.ai.models.get`) ; le détail des commandes est dans `parity.md`. La
  chaîne conversations, non générable par le harnais, est prouvée par l'oracle du domaine (50 cas
  d'égalité stricte, `tests/unit/tutor/test_tutor_domain_vectors.py`) et par la façade
  (`test_tutor_stream_facade.py` : ordre des trames contre `sse.chat`, en-têtes, `[DONE]`), plus le
  comparateur SSE (`tools/parity/test/unit/event-stream.test.ts`, 4 cas).
- **CA-3 — chaque test TypeScript du périmètre a un jumeau pytest vert, référencé** — ✅ **15 des 16
  lignes** de `scope.md` sont faites ; les deux e2e (`spec-602-onboarding`, `spec-709`) ont désormais
  leur jumeau `apps/web/e2e/specs/p22/spec-2204.spec.ts`. La seizième, `packages/tutor/src/loop.test.ts`
  (13 cas), est justifiée : l'agent loop `run_tutor` n'est appelé par aucune des douze opérations — le
  flux de chat utilise le prompt contextualisé, pas la boucle d'outils — et sa bascule appartient à
  SPEC-2205/2207 (voir « Écarts et dettes »). Tous les jumeaux sont référencés dans la table de
  `scope.md`, elle-même dérivée de `evidence/SPEC-2001/test-port-map.md`.
- **CA-4 — contrats import-linter, aucun adaptateur avec règle métier** — ✅
  `uv run lint-imports` → « Contracts: 1 kept, 0 broken. » ; `uv run ruff check .`,
  `uv run ruff format --check packages-py apps` (« 496 files already formatted ») et
  `uv run mypy packages-py apps` (« Success: no issues found in 490 source files ») sont verts. Les
  handlers (`handlers/tutor.py`) ne contiennent aucune règle : ils valident le contrat généré et
  appellent `learny.tutor`, et les adaptateurs de `learny.platform.llm` sont sans règle métier.
- **CA-5 — e2e existants du périmètre sans modification, vidéo à l'appui** — ✅
  `apps/web/e2e/specs/p22/spec-2204.spec.ts` (nouveau, `@SPEC-2204`) passe **2 tests sur 2** à travers
  le web et la façade : le test fonctionnel consomme réellement le flux SSE (session réelle,
  `x-served-by: learny-api`, `x-vercel-ai-ui-message-stream: v1`, événements ordonnés, `finish` puis
  `[DONE]`, message persisté identique au flux) et les sept opérations BYOK ; le test `@visual`
  passe axe et les captures desktop 1440×900 puis mobile 390×844. Les deux tests fonctionnels de
  l'e2e existant `apps/web/e2e/specs/p6/tutor-chat.spec.ts` (SPEC-610 : discussion, sources,
  sélection et nouvelle discussion) passent **sans modification** à travers la façade, vidéo à
  l'appui. Son test `@visual` du panneau tuteur échoue sur la ligne de base pixel (33 099 pixels,
  3 %), un écart de rendu de police qui colore **chaque glyphe de la capture, barre latérale et
  en-tête compris** — aucune ligne de base n'a été régénérée (ADR-0034, ADR-0101) ; la décision
  revient au porteur, comme pour le défaut SPEC-006 consigné par ADR-2019.

## Prouvé dans cette tranche de clôture

| Preuve | Commande | Résultat |
|---|---|---|
| Page de démonstration et titre | `/_dev/sdd/SPEC-2204` (e2e `@visual`) | axe sans violation, captures desktop et mobile |
| Flux SSE par le web et la façade | `pnpm test:e2e --grep "@SPEC-2204\b"` | 2 réussis, 0 échec, vidéos et captures collectées |
| Sept opérations BYOK de bout en bout | même test | création masquée, listage, découverte, qualification `compatible`, cinq tâches, affectation, retrait, suppression 204 |
| Conversations de bout en bout | même test | création 201, listage, flux SSE, relecture avec message et sources persistés |
| E2E existants du tuteur | `pnpm test:e2e apps/web/e2e/specs/p6/tutor-chat.spec.ts` | 2 fonctionnels réussis, 1 ligne de base visuelle en écart de rendu (ci-dessus) |

## Prouvé dans les tranches précédentes (rappel)

| Preuve | Commande | Résultat |
|---|---|---|
| Domaine identique à l'oracle TypeScript (strict) | `uv run pytest packages-py/learny/tests/unit/tutor -q` | 72 passed (50 vecteurs + 22 `me.ai.*`) |
| Contexte BYOK, projections et compatibilité | `uv run pytest …/unit/tutor/test_tutor_ai_models.py -q` | 22 passed |
| Clés personnelles sur la base locale (RLS, création, listage, suppression, découverte, qualification, erreurs) | `flock /tmp/learny-sdd-db.lock uv run pytest …/integration/tutor -q` | 26 cas BYOK sur les 55 du contexte |
| Intégration du contexte tutor (conversations, SSE, Teste-moi, BYOK) | même commande | 55 passed |
| Suite unitaire complète | `uv run pytest packages-py/learny/tests/unit apps/api-py/tests/unit -q` | 3482 passed |
| Handlers = opérations `py` | `uv run pytest apps/api-py/tests/unit/test_handlers.py -q` | 3 passed |
| Parité du groupe `tutor` | `corepack pnpm parity:record --group tutor --target http://127.0.0.1:3112` puis `parity:check … 3113` | 2 scénarios, 0 divergence |
| Lint / types / frontières Python | `uv run ruff check .`, `ruff format --check`, `uv run mypy`, `uv run lint-imports` | vert |
| Comparateur SSE du harnais | `corepack pnpm exec vitest run tools/parity/test/unit/event-stream.test.ts` | 4 passed |
| Inventaire à jour | `corepack pnpm exec tsx tools/migration/inventory.mjs --check` | « Inventory up to date: 217 operations » |

Chiffrement aller-retour : `test_the_stored_key_is_encrypted_with_the_row_envelope` déchiffre la
colonne `encrypted_key` avec `decrypt_secret` et l'AAD `learny:ai_credentials:<credId>:<userId>`,
vérifie la clé retrouvée, `key_last4`, l'empreinte et le préfixe stockés, et que le DTO ne contient
ni clé ni chiffré. L'e2e rejoue la même promesse par la façade : la charge de création ne contient
ni la clé ni `encryptedKey`, et `keyMasked` ne laisse voir que le préfixe et les quatre derniers
caractères.

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
`api/oracles/vectors/tutor.json` (7 trames : `start`, `text-start`, `text-delta`, `text-end`,
`data-sources`, `data-follow-ups`, `finish`), et vérifie `content-type`, `cache-control`,
`x-vercel-ai-ui-message-stream`, `x-request-id`, `x-served-by`, et la terminaison exacte
`data: [DONE]\n\n`. La page de démonstration affiche cette séquence lue dans le même oracle, et son
e2e vérifie l'ordre reçu sur le fil.

## Anomalie trouvée et corrigée — validation stricte des enums (ADR-2030)

Le test de bout en bout par la façade a révélé que `me.ai.credentials.create` répondait 422
`VALIDATION_FAILED` avec un seul champ en erreur, `body.provider` : le pipeline validait les corps
avec `model_validate(strict=True)`, et Pydantic refuse alors la valeur texte d'un `StrEnum`
(`is_instance_of`), là où Zod accepte la chaîne et seulement elle. Le défaut était **latent depuis
SPEC-2201** et touchait déjà `me.ai.task-models.update` (`body.task`).

Correction dans le code Python (aucun contrat, aucun oracle, aucun libellé modifié) :
`validate_input` valide désormais un corps depuis sa forme JSON
(`model_validate_json(strict=True)`), le mode JSON acceptant la valeur texte d'un enum tout en
refusant toujours un nombre envoyé comme chaîne. Deux cas ajoutés à
`apps/api-py/tests/unit/test_validate.py` (enum accepté, valeur inconnue refusée) ; le cas existant
« nombre en chaîne refusé en mode strict » reste vert.

## Écarts assumés et dettes

- **Agent loop `run_tutor`** (`packages/tutor/src/loop.ts`, `loop.test.ts`, 13 cas) : non porté par
  cette tranche. Aucune des douze opérations ne l'appelle ; les activités qui l'utilisent relèvent
  des jobs, dont la bascule est SPEC-2207 (le plan P22 la rattache à cette phase, mais son câblage
  et ses consommateurs y sont traités). La ligne reste `pending` dans `scope.md` avec cette raison.
- **Dette `gradeOpenAnswers`** (`packages/services/src/quiz/submit.ts`) : non portée ici. C'est la
  correction IA des réponses ouvertes d'une tentative de quiz, appelée par le job de soumission ;
  aucune route du périmètre `tutor` ne l'appelle et `quiz_submit.py` documente déjà qu'elle appartient
  au contexte IA. Elle est reprise par **SPEC-2207** avec le passage des jobs au worker, sans
  changement de contrat HTTP (la tentative reste `submitted` tant qu'une réponse ouverte n'est pas
  corrigée, comme le TypeScript en échec de tâche).
- **Jobs `prepare_question_bank` et `process_question_bank_jobs`** : non portés ; atteignables
  seulement par les crons et `course/generated`, ils suivent les consommateurs de SPEC-2207
  (voir CA-1).
- **Découverte vivante** (`discover_provider_models`, httpx 15 s) : non exercée par la suite (aucun
  fournisseur réel, ADR-0048) ; le mode mock est la seule configuration servie tant que les
  adaptateurs vivants n'existent pas. `LLM_MODE=mock` reste la seule valeur acceptée au démarrage
  (`build_llm`), et le code `CREDENTIAL_DECRYPT_FAILED` reste déclaré au contrat pour les
  adaptateurs vivants.
- **`markCredentialStatus`** et la batterie des treize briques (`qualificationBrickBattery`,
  `stopAfterInvalidBrick`) : hors du protocole atteignable par `me.ai.credentials.qualify`
  (ADR-2028) ; elles voyagent avec la tranche des jobs.
- **ADR-2026** — copie verbatim de `looksInjection`, `asksForTest` et `mockGradeScenario` dans
  `tools/oracles/tutor-helpers.ts`. **ADR-2027** — `learny_api/sse.py` créé faute de writer SSE
  Python. **ADR-2029** — `LlmGateway.session` et `MockSession` partagent le curseur d'une fixture.
  **ADR-2030** — validation stricte des corps en mode JSON.
- `apply_learning_result` comme unique écrivain de la maîtrise ; le service Teste-moi ne touche
  `notion_states` que pour replacer une notion ratée dans le quiz global.
- Une conversation ou une clé d'autrui est un 404 : la lecture passe par RLS, puis le service rend
  `NOT_FOUND`/`CREDENTIAL_NOT_FOUND` avec le libellé `locale_fr`.
- Le message apprenant est écrit et `tutor/question-asked` émis avant l'appel modèle ; le message du
  tuteur n'est écrit qu'après un flux complet.
- L'e2e a révélé que la façade de test ne recevait pas `APP_ENCRYPTION_KEY` : la clé de test est
  ajoutée à son environnement dans `apps/web/playwright.config.ts`, sans toucher à aucune assertion
  ni à aucune ligne de base.

## Reste

Aucun travail de cette spécification. Les points ci-dessus sont des dettes explicitement rattachées à
SPEC-2207 (jobs et boucle d'agent) ou au porteur du projet (ligne de base visuelle de SPEC-610).
