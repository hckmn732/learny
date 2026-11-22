# SPEC-2204 — passation

Branche `spec/SPEC-2204-domaine-tuteur-sse`, worktree `learny-wt-SPEC-2204`. SPEC-2204 reste
`in_progress` : les douze opérations du contexte `tutor` sont servies par Python (conversations, SSE
et BYOK), la clôture (page, e2e, validation, `complete`) reste à faire.

## Livré

| Zone | Fichiers |
|---|---|
| Textes | `learny/shared/locale_fr/tutor.py` (conversations, Teste-moi), `learny/shared/locale_fr/ai.py` (clés personnelles et onglet Modèles d'IA) |
| SQL | `learny/tutor/infrastructure/queries.py` (conversations, contexte, flux, Teste-moi), `byok_queries.py` (`ai_credentials`, `ai_task_models`) |
| Domaine | `learny/tutor/domain/{context,prompts,sources,follow_ups,events,turn,starters,format}.py`, `ai_credentials.py` (DTO public, raffinements du corps), `ai_models.py` (projections pures de l'onglet) |
| Cas d'usage | `learny/tutor/application/{ports,llm,context,conversations,stream,self_test,byok}.py` |
| Surface publique | `learny/tutor/public.py` (les douze cas d'usage, `starters_of` conservé) |
| Plateforme IA | `learny/platform/llm/{catalog,discovery,qualification}.py` + `gateway.py` (session de fixtures) |
| Writer SSE | `apps/api-py/src/learny_api/sse.py` |
| Handlers | `apps/api-py/src/learny_api/handlers/tutor.py`, `handlers/__init__.py`, `validate.py` (raffinements `me.ai.*`) |
| Bascule | `api/ownership.yaml` : les douze opérations du contexte `tutor` → `py` |
| Tests | `tests/factories/{tutor_support,byok_support}.py`, `tests/integration/tutor/test_tutor_{conversations,stream,self_test,stream_facade,byok}.py` (55 cas), `tests/unit/tutor/test_tutor_ai_models.py` (22 cas), `apps/api-py/tests/unit/test_validate.py` (31 cas) |
| Parité | `tools/parity/run.ts` (comparaison SSE) + `tools/parity/test/unit/event-stream.test.ts` ; groupe `tutor` enregistré (2 scénarios) |
| Décisions | ADR-2026 (copie verbatim des prédicats dans l'oracle), ADR-2027 (`sse.py` créé), ADR-2028 (périmètre de `qualify`), ADR-2029 (session de fixtures), ADR-2030 (corps validés en mode JSON) |

## Reste à faire

1. **Page `/_dev/sdd/SPEC-2204` et e2e** `apps/web/e2e/specs/p22/spec-2204.spec.ts` (parcours
   discussion, Teste-moi, citation, clé personnelle et onglet Modèles d'IA), avec `@visual` si la page
   en a besoin.
2. **Acceptance finale** : cocher CA-1 à CA-5, joindre les sorties de `validate.mjs`, puis
   `node tools/sdd/validate.mjs SPEC-2204` et `node tools/sdd/complete.mjs SPEC-2204 --no-merge --no-push`.
3. `loop.test.ts` (`packages/tutor/src/loop.test.ts`) n'a pas encore de jumeau pytest : l'agent loop
   n'est pas porté (SPEC-2205/2207).

## Points d'attention pour la suite

- `test_language_policy` interdit tout non-ASCII hors `locale_fr` : les nouveaux textes français
  doivent y être ajoutés, jamais dans le code ni dans les tests. Les messages attendus se comparent
  aux constantes (`learny.shared.locale_fr.ai`, `details`), jamais à un littéral.
- La base locale partagée est sérialisée par `flock /tmp/learny-sdd-db.lock` ; les tests du tuteur
  utilisent `rolled_back` et ne commitent rien.
- Les transactions de `LearningTransactions` sont des savepoints : `created_at`/`now()` sont donc
  identiques pour deux lignes d'un même test. Trier par `created_at` ne suffit pas dans un test ;
  viser les lignes par identifiant, par libellé ou par contenu.
- Le trigger `set_updated_at` écrase l'horodatage passé par le cas d'usage : ne pas asserter
  `updated_at` sur la valeur de l'horloge injectée.
- **BYOK** : `create_credential` et `qualify_credential` chargent la clé maîtresse avec
  `load_keyring(os.environ)` (`APP_ENCRYPTION_KEY`, 32 octets base64) ; un test qui appelle les cas
  d'usage directement doit poser la variable (voir la fixture `master_key` de `test_tutor_byok.py`).
  `ALLOW_LOCAL_MODELS=true` est le seul moyen d'enregistrer un fournisseur `local`.
- **Fixtures de qualification** : elles ne sont pas dans le registre global des tâches. Une session
  de qualification doit passer `fixtures=qualification_registry()` (ADR-2029) ; sans cela,
  `MOCK_FIXTURE_NOT_FOUND`. Le curseur de session est ce qui rend la sonde `vision` de la tâche
  `light` distincte de la sonde `structured`.
- **Validation des corps** : `validate_input` valide un corps depuis sa forme JSON
  (`model_validate_json(strict=True)`, ADR-2030). Un test unitaire qui appelle `validate_input` avec
  un `StrEnum` doit donc passer par le pipeline, pas par `model_validate(strict=True)` : ce dernier
  refuse la valeur texte d'un enum.
- **Découverte** : `discover_provider_models` est simulée par `LLM_MODE=mock` (liste fixe par
  fournisseur) et n'ouvre aucune socket en test ; le chemin vivant (httpx, 15 s) prend un `fetcher`
  injectable et n'est pas exercé par la suite.
- Les preuves BYOK reposent sur `test_tutor_byok.py` (26 cas) : le wrapper HTTP (idempotence,
  fresh auth, origin) est prouvé par les tests génériques du pipeline (SPEC-2201) et
  `test_handlers.py` ; la parité couvre les deux lectures générables.
