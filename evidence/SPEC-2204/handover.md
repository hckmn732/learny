# SPEC-2204 — passation

Branche `spec/SPEC-2204-domaine-tuteur-sse`, worktree `learny-wt-SPEC-2204`. SPEC-2204 reste
`in_progress` : cette tranche livre le runtime des conversations et bascule cinq opérations, la
clôture (page, e2e, validation, `complete`) reste à faire.

## Livré

| Zone | Fichiers |
|---|---|
| Textes | `learny/shared/locale_fr/tutor.py` (libellés des conversations et de Teste-moi) |
| SQL | `learny/tutor/infrastructure/queries.py` (copie de `conversations`, `context`, `stream`, `self-test`, et des insertions de brique/activité/tentative/réponse) |
| Cas d'usage | `learny/tutor/application/{ports,llm,context,conversations,stream,self_test}.py` |
| Surface publique | `learny/tutor/public.py` (les cinq cas d'usage, `starters_of` conservé) |
| Writer SSE | `apps/api-py/src/learny_api/sse.py` |
| Handlers | `apps/api-py/src/learny_api/handlers/tutor.py`, `handlers/__init__.py` |
| Bascule | `api/ownership.yaml` : `conversations.get`, `conversations.messages`, `conversations.self-test.answer`, `courses.conversations.create`, `courses.conversations.list` → `py` |
| Tests | `tests/factories/tutor_support.py`, `tests/integration/tutor/test_tutor_{conversations,stream,self_test,stream_facade}.py` (28 cas) |
| Parité | `tools/parity/run.ts` (comparaison SSE) + `tools/parity/test/unit/event-stream.test.ts` |
| Décisions | ADR-2026 (copie verbatim des prédicats dans l'oracle), ADR-2027 (`sse.py` créé) |

## Reste à faire

1. **Les sept opérations `me.ai.*`** (`credentials.create/delete/discover/list/qualify`,
   `models.get/update`) : credentials BYOK, qualification des modèles, table `ai_credentials` /
   `ai_task_models`, et leurs tests portés depuis `packages/services/src/ai/*`. Elles restent `ts`.
2. **Page `/_dev/sdd/SPEC-2204` et e2e** `apps/web/e2e/specs/p22/spec-2204.spec.ts` (parcours
   discussion, Teste-moi, citation), avec `@visual` si la page en a besoin.
3. **Enregistrement de parité du groupe `tutor`** si un amorçage de cours est ajouté au harnais ;
   sinon la décision de s'appuyer sur l'oracle et l'intégration est déjà écrite dans `parity.md`.
4. **Acceptance finale** : cocher CA-1 à CA-5, joindre les sorties de `validate.mjs`, puis
   `node tools/sdd/validate.mjs SPEC-2204` et `node tools/sdd/complete.mjs SPEC-2204 --no-merge --no-push`.

## Points d'attention pour la suite

- `test_language_policy` interdit tout non-ASCII hors `locale_fr` : les nouveaux textes français
  doivent y être ajoutés, jamais dans le code ni dans les tests.
- La base locale partagée est sérialisée par `flock /tmp/learny-sdd-db.lock` ; les tests du tuteur
  utilisent `rolled_back` et ne commitent rien. Un script de débogage hors `rolled_back` laisse des
  lignes (un utilisateur `id-*.test.learny.test` a dû être supprimé pendant la session).
- Les transactions de `LearningTransactions` sont des savepoints : `created_at`/`now()` sont donc
  identiques pour deux messages d'un même test. Trier par `created_at` ne suffit pas dans un test ;
  viser les lignes par identifiant ou par contenu.
- Le trigger `set_updated_at` écrase l'horodatage passé par le cas d'usage : ne pas asserter
  `updated_at` sur la valeur de l'horloge injectée.
- Le writer SSE ne valide pas de sortie JSON (la route `conversations.messages` n'a pas de contrat de
  sortie) ; le corps est produit par `learny.tutor.domain.events`.

