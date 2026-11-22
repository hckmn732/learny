# SPEC-2204 — passation

Branche `spec/SPEC-2204-domaine-tuteur-sse`, worktree `learny-wt-SPEC-2204`. SPEC-2204 est
**clôturée** : les douze opérations du contexte `tutor` sont servies par Python (conversations, flux
SSE et BYOK), la page de démonstration et son e2e sont livrés, et `validate.mjs` passe ses huit
étapes (`evidence/SPEC-2204/checks.json`). Commits de clôture : `7c393e37` (page) et `3514a0b9`
(e2e, inventaire).

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
| Tests | `tests/factories/{tutor_support,byok_support}.py`, `tests/integration/tutor/test_tutor_{conversations,stream,self_test,stream_facade,byok}.py` (55 cas), `tests/unit/tutor/test_tutor_ai_models.py` (22 cas), `tests/unit/tutor/test_tutor_domain_vectors.py` (50 cas), `apps/api-py/tests/unit/test_validate.py` (31 cas) |
| Parité | `tools/parity/run.ts` (comparaison SSE) + `tools/parity/test/unit/event-stream.test.ts` ; groupe `tutor` enregistré (2 scénarios) |
| Page et e2e | `apps/web/components/sdd-demos/spec-2204.tsx`, entrée `SPEC-2204` du registre, `apps/web/e2e/specs/p22/spec-2204.spec.ts` (fonctionnel SSE + BYOK, `@visual` desktop et mobile) |
| Décisions | ADR-2026 (copie verbatim des prédicats dans l'oracle), ADR-2027 (`sse.py` créé), ADR-2028 (périmètre de `qualify`), ADR-2029 (session de fixtures), ADR-2030 (corps validés en mode JSON) |

## Reste

Rien pour cette spécification. Les dettes sont explicitement rattachées :

1. `loop.test.ts` (13 cas) et l'agent loop `run_tutor` : aucune des douze opérations ne l'appelle ;
   bascule avec les jobs (SPEC-2205/2207).
2. `gradeOpenAnswers` (correction IA des réponses ouvertes d'une tentative de quiz) : job de
   soumission, aucune route du périmètre ; reprise par SPEC-2207.
3. `prepare_question_bank` et `process_question_bank_jobs` : crons et `course/generated`, repris par
   SPEC-2207.
4. Ligne de base visuelle du panneau tuteur (SPEC-610) : écart de rendu de police sur cet hôte
   (3 % des pixels, chaque glyphe), non régénérée ; décision du porteur, comme ADR-2019.

## Points d'attention pour la suite

- `test_language_policy` interdit tout non-ASCII hors `locale_fr` : les nouveaux textes français
  doivent y être ajoutés, jamais dans le code ni dans les tests. Les messages attendus se comparent
  aux constantes (`learny.shared.locale_fr.ai`, `details`), jamais à un littéral.
- La base locale partagée est sérialisée par `flock /tmp/learny-sdd-db.lock` ; les tests du tuteur
  utilisent `rolled_back` et ne commitent rien. `validate.mjs` ne doit jamais tourner sous `flock`.
- Les transactions de `LearningTransactions` sont des savepoints : `created_at`/`now()` sont donc
  identiques pour deux lignes d'un même test. Trier par `created_at` ne suffit pas dans un test ;
  viser les lignes par identifiant, par libellé ou par contenu.
- Le trigger `set_updated_at` écrase l'horodatage passé par le cas d'usage : ne pas asserter
  `updated_at` sur la valeur de l'horloge injectée.
- **BYOK** : `create_credential` et `qualify_credential` chargent la clé maîtresse avec
  `load_keyring(os.environ)` (`APP_ENCRYPTION_KEY`, 32 octets base64) ; un test qui appelle les cas
  d'usage directement doit poser la variable (voir la fixture `master_key` de `test_tutor_byok.py`).
  La façade de test la reçoit désormais par `apps/web/playwright.config.ts`, ce qui rend l'e2e BYOK
  possible. `ALLOW_LOCAL_MODELS=true` est le seul moyen d'enregistrer un fournisseur `local`.
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
- **E2E** : le fixture `request` ne partage pas les cookies du contexte ; passer
  `cookie: session.cookieHeader` et `origin`, plus `idempotency-key` sur les routes idempotentes.
  Pour le SSE, lire le corps en `text()` puis analyser les lignes `data:` (le writer ferme le corps
  par `data: [DONE]`).
