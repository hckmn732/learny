# Acceptation — SPEC-2202 (domaines learning et assessments en Python)

Périmètre : **41 opérations** de l'inventaire — **15 `learning`** et **26 `assessments`** —, le
moteur d'apprentissage porté (FSRS 5.4.2, maîtrise, rétention, série, lacunes, planificateur) et les
briques d'évaluation. Dernier commit de la branche : voir `git log -1 --format=%H`.

Les chiffres de périmètre viennent de `api/inventory.json` (généré par SPEC-2001) et de
`api/ownership.yaml` ; la matrice complète opération → cas d'usage → règles → tables → tests est
dans [`scope.md`](./scope.md), les scénarios rejoués dans [`parity.md`](./parity.md).

## CA-1 — Opérations du périmètre à `py`, cas d'usage des jobs portés et testés, matrice `parity.md` complète ✅

- Bascule effective : `learning` **15 / 15** et `assessments` **26 / 26** à `py` dans
  `api/ownership.yaml` (41 / 41, aucune opération restante en `ts` dans le périmètre).
- Matrice entrée → cas d'usage → règles → tables → tests : section « Opérations du périmètre »
  de [`scope.md`](./scope.md) ; détail des modules portés, des requêtes et des handlers aux
  étapes 3 à 7 du même document.
- Cas d'usage appelés par des jobs (portés et testés ici, branchés au worker en SPEC-2207) :
  `quiz-grade` (déclenché par `quiz/submitted`, `exam.attempts.submit` et `quiz.attempts.submit`),
  `module-unlock` (`exam/submitted`), `exam-deadline`, `remediation-prepare`
  (`remediation/requested`, émis par `remediation.prepare`) et `plan-programme`. Les événements
  `exam/started`, `exam/submitted`, `quiz/submitted`, `exercise/submitted`,
  `remediation/requested`, `gap/detected`, `gap/nature-changed` et `gap/cleared` sont écrits dans
  `public.event_outbox` par `tx.emit`, dans la transaction métier, avec les identifiants de
  déduplication du TypeScript
  (`packages-py/learny/src/learny/assessments/application/*.py`,
  `packages-py/learny/src/learny/learning/application/apply_result.py`).
- Tests serveur des cas d'usage : `packages-py/learny/tests/integration/{learning,assessments}/`
  (voir les tableaux des étapes 4, 6 et 7 de `scope.md`).

## CA-2 — Parité contractuelle du périmètre, zéro divergence inexpliquée ✅

- `pnpm parity:record --group learning` puis `pnpm parity:check` contre la façade :
  **4 scénarios, 0 divergence**. Idem pour `assessments` : **1 scénario, 0 divergence**
  (`offline.pack`), soit **5 scénarios** enregistrés dans `api/oracles/recordings/reads.json` et
  rejoués à l'identique. Détail, méthode et correction des trois divergences trouvées :
  [`parity.md`](./parity.md).
- Les autres opérations `py` du périmètre portent un paramètre de chemin ou sont des mutations, que
  l'outil de parité ne génère pas : leur comportement (statuts, corps, événements, idempotence,
  verrous consultatifs, effets en base) est prouvé par les tests d'intégration serveur listés dans
  `scope.md`, et par l'e2e ci-dessous.
- Divergence wire détectée par l'e2e de cette clôture : sur une entrée rejetée,
  `offline.sync` renvoyait `correct: null` et `nextDueAt: null` là où `JSON.stringify` omet les
  champs optionnels absents de Zod. Corrigé **dans le code Python**
  (`learny_api.pipeline.without_absent_optionals`), verrouillé par
  `apps/api-py/tests/unit/test_output_optionals.py` : un `null` explicite reste un `null`, un champ
  non fourni par le handler disparaît. Aucune assertion d'oracle n'a été modifiée.

## CA-3 — Tous les tests TypeScript du périmètre ont un équivalent pytest vert ✅

- [`test-port-map.md`](./test-port-map.md) : pour chaque module du domaine, le test TypeScript
  source, le fichier pytest, le nombre de cas et la fixture d'oracle — moteur (FSRS, maîtrise,
  rétention, progression, série, lacunes, quiz global, échauffement, tirage, planificateur, types),
  briques (13 types, validation, correction par le code, empreinte, mélange, payload public) et
  services d'évaluation (format et tentatives d'examen, quiz, résultat, remédiation, hors ligne).
- Les cas non portés sont listés avec leur motif : `ensurePracticeExercise` (aucun appel du
  périmètre, SPEC-2205), correction des réponses ouvertes par le tuteur (contexte IA, SPEC-2204).
- Suite Python complète : **1 476 tests** verts, dont les fichiers marqués
  `pytestmark = pytest.mark.spec("SPEC-2202")` rejoués par `validate.mjs`.

## CA-4 — Contrats import-linter verts, aucun adaptateur ne contient de règle métier ✅

- `uv run lint-imports` : contrats verts ; `learny.learning`, `learny.assessments`,
  `learny.shared` et `learny.platform` n'importent ni `learny.views` ni les applications.
- Les handlers `apps/api-py/src/learny_api/handlers/{learning,assessments}.py` ne contiennent
  aucune règle : ils lisent les modèles générés et appellent le cas d'usage, une fonction par
  opération. `apps/api-py/tests/unit/test_handlers.py` vérifie qu'une opération `py` a toujours un
  handler.
- Les règles vivent dans `learny/learning/domain/` et `learny/assessments/domain/` (FSRS, maîtrise,
  série, lacunes, planificateur, briques) ; les requêtes dans
  `learny/{learning,assessments}/infrastructure/queries.py`. Le domaine des briques reste la seule
  autorité de validation et de correction : aucune règle n'est dupliquée dans l'application.

## CA-5 — Les e2e du périmètre passent sans modification à travers la façade Python ✅

- `PLAYWRIGHT_REUSE_SERVER=0 pnpm test:e2e --grep "@SPEC-2202\b"` : **2 tests verts**, dont
  **1 test `@visual`**, et **4 vidéos** collectées ; rapports `e2e.json` et `e2e.xml`, vidéos,
  captures et résultats axe dans `evidence/SPEC-2202/`.
  - `apps/web/e2e/specs/p22/spec-2202.spec.ts` : session réelle (`createTestSession`) ; `series.streak`
    (`learning`) et `offline.pack` (`assessments`) répondent `200` avec `x-served-by: learny-api` et
    le contrat attendu (14 cases de régularité, `computedOn` au jour figé, paquet vide du compte
    neuf) ; `offline.sync` (mutation `assessments`) renvoie 200, un résultat par entrée, puis
    `duplicate` au rejeu du même `clientId` — un seul effet.
  - Test `@visual` : `axeCheck` sans violation sérieuse ou critique, puis `captureEvidence`
    desktop (1440 × 900) et mobile (390 × 844) de la page `/_dev/sdd/SPEC-2202`.
- Les e2e existants du périmètre (`apps/web/e2e/specs/p7/*`, `.../p8/offline.spec.ts`,
  `.../journeys/review-automations.spec.ts`) passent sans modification à travers la façade ; ils ne
  sont pas réécrits par cette spécification.
- Aucune assertion d'oracle ni ligne de base visuelle existante n'a été modifiée
  (ADR-1001, ADR-2008) : `git diff <commit de départ> -- apps/web/__screenshots__` est vide ; les
  captures de cette spécification sont des preuves, pas des lignes de base.

## Contrôles de qualité

Mesures du **2026-11-22** sur la VM de développement (Supabase local, horloge figée au
2026-11-11T12:20:00Z, `LLM_MODE=mock`, `TZ=UTC`) ; les étapes `validate.mjs` sont enregistrées dans
[`checks.json`](./checks.json) avec leur horodatage.

| Contrôle | Commande | Résultat |
|---|---|---|
| Lint Python | `uv run ruff check .` et `uv run ruff format --check packages-py apps` | vert |
| Types Python | `uv run mypy packages-py apps` | vert |
| Import-linter | `uv run lint-imports` | vert |
| Unités et intégration Python | `uv run pytest packages-py apps -q` | vert (**1 476 tests**) |
| Contrat Python | `pnpm py:contract:check` | vert (artefacts générés inchangés) |
| Inventaire | `tsx tools/migration/inventory.mjs --check` | vert (217 opérations) |
| Lint racine | `pnpm lint` | vert |
| Types racine | `pnpm typecheck` | vert |
| Construction | `pnpm build` | vert |
| Unités TypeScript | `pnpm test:unit` | vert (aucun test TypeScript étiqueté `[SPEC-2202]`) |
| Intégration TypeScript | `pnpm test:int` | vert |
| e2e du périmètre | `pnpm test:e2e --grep "@SPEC-2202\b"` | vert (2 tests, 1 `@visual`, 4 vidéos) |
| Visuel du périmètre | `pnpm test:e2e --grep "@SPEC-2202\b"` (test `@visual`) | vert |
| Validation SDD | `node tools/sdd/validate.mjs SPEC-2202` | 8 étapes vertes : lint, typecheck, build, unit (729 pytest), intégration (210 pytest), e2e (2), visuel (1), acceptance (5/5) |

## Dettes de consommateurs portées par SPEC-2207

Les cas d'usage sont portés, testés et écrivent leurs événements dans la transaction métier ; le
branchement au worker Python et l'activation des consommateurs arrivent en SPEC-2207 (ADR-2014).
Aucune réponse HTTP n'en dépend.

| Consommateur | Événement | Ce qui reste à brancher |
|---|---|---|
| `quiz-grade` | `quiz/submitted`, `exercise/submitted` | applique `apply_learning_result` (FSRS, maîtrise, lacunes, journal) après la tentative notée ; la fonction est publique et testée (`application/apply_result.py`) |
| `module-unlock` | `exam/submitted` | débloque le module suivant et écrit la progression |
| `exam-deadline` | planification | déclenche la soumission à l'échéance (le use case d'expiration paresseuse est porté et testé) |
| `remediation-prepare` | `remediation/requested` | exécute la préparation de remédiation (le use case et la fixture mock `remediation-plan` sont portés et testés) |

Autres restes documentés, hors périmètre de cette spécification :

- Notifications `engagement` (jalon de série, fin de session, score) : le service `notify` relevait
  de SPEC-2205 ; la donnée (série, jalon) est écrite à l'identique. **Reprise faite par SPEC-2205**
  (`learny/engagement/application/notify.py`) : les jalons `notions_100` et `streak_30` sont
  désormais annoncés, et `review.complete` réconcilie les jalons après son commit. Preuve :
  `tests/integration/engagement/test_engagement_milestone_wiring.py`.
- `requestRefill` et `requestQuizRegeneration` (banque de questions épuisée, SPEC-513) : le DTO est
  identique (`status: "preparing"` ou `"empty"`), la demande de génération n'est pas émise.
- `gradeOpenAnswers` (correction des réponses ouvertes par le tuteur, contexte IA) : la tentative
  reste `submitted` tant qu'une réponse ouverte n'est pas corrigée, exactement comme le TypeScript
  quand la tâche du tuteur échoue.
- `ensurePracticeExercise` : non porté, aucun appel du périmètre (automatisation `jeu-lacune`,
  SPEC-2205 ; e2e SPEC-613).
- `home.get` (ADR-2023) et `formations.resume` (ADR-2024) restent `ts` : ils appartiennent aux
  contextes `identity` et `formation`, hors des 41 opérations inventoriées pour cette spécification.
  Le planificateur étant désormais porté, la reprise est débloquée ; son basculement est une décision
  de la spécification propriétaire, sans changement de contrat.

## Écarts résiduels connus (consignés)

1. **Ordre des clés JSON.** La comparaison de parité trie les clés des corps ; l'ordre n'est pas un
   contrat, les valeurs restent identiques terme à terme.
2. **Messages des erreurs `SCHEMA_INVALID`.** Les messages des règles internes sont repris mot pour
   mot du TypeScript ; ceux du validateur de schéma sont en anglais (ADR-2011) et comparés sur
   `code`, `path`, ordre et nombre d'issues, jamais sur le texte.
3. **`null` explicite en entrée.** Là où Zod refuse `null` sur un champ optionnel, Pydantic l'accepte
   comme absent (comportement conservé de SPEC-2201, aucun appelant ni oracle concerné) ; la sortie,
   elle, est désormais identique (voir CA-2).
