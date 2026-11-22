# SPEC-2204 — acceptance

Branche `spec/SPEC-2204-domaine-tuteur-sse`, worktree `learny-wt-SPEC-2204`, base `65ebfec1`.
Statut : **en cours** (tranche runtime livrée, reste la page et la clôture). Chaque critère dit ce
qui est prouvé et ce qui reste.

- **CA-1 — les 12 opérations en `py`** — ⏳ 5/12. Les cinq opérations de conversation sont servies par
  Python (`api/ownership.yaml`), avec leurs handlers et le writer SSE dans le même commit. Les sept
  `me.ai.*` (credentials et modèles BYOK) restent `ts` : autre tranche, non touchée.
- **CA-2 — parité, zéro divergence** — ✅ sur le domaine : 50 cas d'égalité stricte avec l'oracle
  `api/oracles/vectors/tutor.json`. La comparaison SSE est ajoutée à `tools/parity/run.ts` (liste
  ordonnée des `data:`), mais l'enregistrement du groupe `tutor` n'est pas faisable dans le budget :
  il faudrait amorcer un cours prêt et une conversation, ce que le harnais ne sait pas faire (détail
  et preuve de repli dans `parity.md`).
- **CA-3 — chaque test TS a un jumeau pytest** — ⏳ 8 des 16 lignes de `scope.md` sont faites ; les
  trois tests de service de cette tranche ont leur jumeau d'intégration. Restent `loop.test.ts`, les
  cinq tests `me.ai.*` (autre tranche) et l'e2e (page à venir).
- **CA-4 — contrats import-linter** — ✅ `uv run lint-imports` → 1 kept, 0 broken.
- **CA-5 — e2e à travers la façade** — ⏳ pas encore de spec e2e ; les opérations sont servies par
  Python et prouvées par l'intégration de la façade (ordre SSE, en-têtes, 404).

## Prouvé dans cette tranche

| Preuve | Commande | Résultat |
|---|---|---|
| Domaine identique à l'oracle TypeScript (strict) | `uv run pytest packages-py/learny/tests/unit/tutor -q` | 50 passed |
| Conversations, flux SSE et Teste-moi sur la base locale | `flock /tmp/learny-sdd-db.lock uv run pytest packages-py/learny/tests/integration/tutor -q` | 28 passed |
| Suite unitaire complète | `uv run pytest packages-py/learny/tests/unit apps/api-py/tests/unit -q` | 3458 passed |
| Handlers = opérations `py` | `uv run pytest apps/api-py/tests/unit/test_handlers.py -q` | 3 passed |
| Lint / types / frontières | `uv run ruff check .`, `uv run ruff format --check packages-py apps`, `uv run mypy packages-py apps`, `uv run lint-imports` | vert |
| Comparateur SSE du harnais de parité | `corepack pnpm exec vitest run tools/parity/test/unit/event-stream.test.ts` | 4 passed |

## Latence du premier chunk

Mesurée à travers la façade réelle (route FastAPI, pipeline, handler, `StreamingResponse`) sur la
base locale et le modèle simulé, en pilotant l'application par l'interface ASGI pour horodater chaque
trame produite :

| Mesure | Valeur | Seuil du test |
|---|---|---|
| Premier événement `start` reçu par le client | **50,0 ms** | < 500 ms |

Test : `packages-py/learny/tests/integration/tutor/test_tutor_stream_facade.py::test_the_first_chunk_arrives_within_the_bound`
(`uv run pytest … -s -k first_chunk` affiche la valeur). Le montant inclut la lecture du contexte
(six requêtes), l'écriture du message apprenant, l'émission `tutor/question-asked` et l'ouverture du
flux simulé : la transaction est fermée avant, et aucune connexion n'est retenue pendant le flux.

## Ordre des événements SSE

`test_tutor_stream_facade.py::test_the_route_answers_the_ai_sdk_stream_with_the_oracle_order` compare
la liste ordonnée des types de trames reçues par le client à celle de `sse.chat` de
`api/oracles/vectors/tutor.json`, vérifie `content-type`, `cache-control`,
`x-vercel-ai-ui-message-stream`, `x-request-id`, `x-served-by`, et la terminaison exacte
`data: [DONE]\n\n`.

## Écarts assumés et décisions

- **ADR-2026** — copie verbatim de `looksInjection`, `asksForTest` et `mockGradeScenario` dans
  `tools/oracles/tutor-helpers.ts` : importer `@learny/services` dans l'oracle tirerait les clients
  Postgres et LLM, et rendrait l'enregistrement non reproductible.
- **ADR-2027** — `learny_api/sse.py` n'existait pas malgré la section 2 des conventions (aucune route
  SSE Python jusqu'ici) ; le writer est créé ici, sans logique de flux.
- `apply_learning_result` comme unique écrivain de la maîtrise ; le service Teste-moi ne touche
  `notion_states` que pour replacer une notion ratée dans le quiz global
  (`update public.notion_states … where user_id and notion_id`), exactement comme le TypeScript.
- Une conversation d'autrui est un 404 : la lecture passe par RLS, puis `conversationRef` rend
  `NOT_FOUND` avec le libellé `locale_fr` (`texts.CONVERSATION_NOT_FOUND`).
- Le message apprenant est écrit et `tutor/question-asked` émis avant l'appel modèle ; le message du
  tuteur n'est écrit qu'après un flux complet, et une erreur du flux marque le message apprenant
  (`context.error`) puis écrit une trame `error`.

## Reste à faire (prochaine session)

1. Les sept opérations `me.ai.*` (credentials BYOK et modèles) avec leurs tests et leur bascule.
2. La page `/_dev/sdd/SPEC-2204` et `apps/web/e2e/specs/p22/spec-2204.spec.ts`.
3. Enregistrement de parité du groupe `tutor` si le harnais apprend à amorcer un cours (ou décision
   définitive de s'appuyer sur l'oracle et l'intégration, consignée dans `parity.md`).
4. `node tools/sdd/validate.mjs SPEC-2204` puis `complete.mjs --no-merge --no-push`.

