# SPEC-2102 — Outbox et worker Python remplaçant Inngest

- Date : 2026-11-21
- Branche : `spec/SPEC-2102-outbox-worker`
- Dernier commit de code : `2b5d64b4` (les preuves sont ajoutées par le commit suivant)
- Environnement : VM de développement Ubuntu 26.04.1 LTS, PostgreSQL 17 local (stack Supabase),
  Python 3.13.18 géré par `uv` 0.13.9, Node 24.22.3, `corepack pnpm` 10.34.9
- Horloge figée `2026-11-11T12:20:00Z` (ADR-0047), `LLM_MODE=mock` (ADR-0048)

## Critères d'acceptation

- ✅ CA-1 — Les tests de crash, concurrence et livraison dupliquée passent avec un seul effet par
  événement.
  Preuve : `apps/worker-py/tests/integration/test_worker_outbox.py` — `test_a_dispatched_event_runs_once`
  (un événement, une livraison, `attempts = 1`, une seule exécution ; un second tour de répartition
  et d'exécution ne change rien), `test_a_crashed_worker_reclaims_its_delivery` (réclamation sans
  exécution, bail expiré comme le ferait l'horloge de la base, reprise en `attempts = 2` pour une
  seule exécution), `test_two_runners_never_share_a_delivery` (quatre livraisons, deux exécuteurs
  concurrents de concurrence 3, une exécution chacune, aucun partage), `test_an_invalid_payload_never_runs`
  (charge utile refusée → livraison `failed`, zéro exécution). Complété par
  `apps/worker-py/tests/unit/test_runner.py` (`test_a_claimed_delivery_is_completed_once`,
  `test_a_transient_failure_is_rescheduled_with_backoff`, `test_the_last_attempt_fails_for_good`,
  `test_a_consumer_that_times_out_is_retried`) et `test_dispatcher.py` (backoff, livraison par
  consommateur). Preuve de bout en bout : `apps/web/e2e/specs/p21/spec-2102.spec.ts` — la route
  TypeScript répond 202, le worker répartit puis clôt la livraison `devtools.demo_job` en un essai
  (`attempts = 1`, `last_error` nul), `dispatched_at` est estampillé et `job_deliveries` ne contient
  qu'une ligne pour l'événement. Rapports : `evidence/SPEC-2102/integration.json`,
  `evidence/SPEC-2102/e2e.json`, `evidence/SPEC-2102/e2e.xml`, vidéo dans
  `evidence/SPEC-2102/video/`.

- ✅ CA-2 — Le planificateur ne s'exécute qu'une fois avec deux instances.
  Preuve : `apps/worker-py/tests/integration/test_worker_outbox.py` —
  `test_two_schedulers_elect_a_single_leader` : deux planificateurs sur la base locale, un seul
  acquiert `pg_try_advisory_lock(21020001)`, l'autre reste en veille et réessaie sans émettre ;
  `test_a_claimed_delivery_marks_its_lease` vérifie que la réclamation pose bien le bail.
  Complété par `apps/worker-py/tests/unit/test_scheduler.py` (`test_a_period_is_emitted_once`,
  `test_the_scheduler_stays_idle_while_the_crons_are_typescript`, `test_a_python_owned_cron_is_emitted_once`).
  Diagnostic d'exploitation : `docs/engineering/outbox-runbook.md` §7 (requête `pg_locks`).
  Rapport : `evidence/SPEC-2102/integration.json`.

- ✅ CA-3 — Aucun événement possédé par Inngest n'est consommé par le worker Python.
  Preuve : `apps/worker-py/tests/integration/test_worker_outbox.py` —
  `test_a_typescript_owned_consumer_is_never_run` : même événement, même registre, mais
  `ownership.yaml` déclare le consommateur `ts` ; le répartiteur ne crée aucune livraison et
  l'exécuteur ne lance rien. Complété par `apps/worker-py/tests/unit/test_dispatcher.py`
  (`test_a_typescript_owned_consumer_is_never_fanned_out`) et
  `apps/worker-py/tests/unit/test_consumers.py` (`test_a_typescript_owned_consumer_is_never_active`,
  `test_an_undeclared_consumer_is_not_active`). `api/ownership.yaml` ne déclare qu'un consommateur
  `py` (`devtools.demo_job`) et laisse `crons` entièrement `ts`. Rapport :
  `evidence/SPEC-2102/integration.json` et `evidence/SPEC-2102/unit.json`.

## EF-5 et ADR-2020 — la bascule des 4 routes dev-jobs est différée

EF-5 demande la bascule des 4 routes `dev-jobs` **et** du consommateur de démonstration à `py`.
Le consommateur bascule et le worker est prouvé de bout en bout, la route TypeScript servant de
producteur. Les 4 routes restent `ts` : la façade Python ne possède pas le pipeline de contrat
(`pipeline.py`, `generated/routes.py`, `generated/models.py`) que SPEC-2003 devait livrer, et servir
ces routes sans lui obligerait à réécrire à la main des DTO déclarés par le contrat, ce qu'interdit
ADR-2011. Décision et conséquences : `docs/adr/ADR-2020-routes-dev-jobs-encore-typescript-jusqu-au-pipeline-python.md`.

## Exploitation

`docs/engineering/outbox-runbook.md` documente le diagnostic (bail expiré, `pending` en retard,
événements non répartis, lettres mortes), le rejeu sûr d'une livraison ou d'un événement, la
conduite d'incident et la vérification du planificateur singleton.

## Invariants respectés (ADR-1001, ADR-2008)

- Aucune assertion d'oracle (e2e, visuel, accessibilité, contrat HTTP) existante modifiée, aucune
  ligne de base visuelle régénérée, aucun libellé changé. La page `/_dev/sdd/SPEC-2102` et son test
  `@SPEC-2102 @visual` sont ajoutés par cette spec ; le test e2e de cette même spec a été corrigé
  pendant son écriture (en-tête `idempotency-key` obligatoire, cookie de session envoyé
  explicitement) — aucun oracle antérieur n'est concerné.
- Aucune dépendance ajoutée hors ADR-2015 : `fastapi` et `uvicorn` étaient déjà verrouillés pour la
  façade, `uv.lock` ne change que les métadonnées du paquet `learny-worker`.
- Migration additive seulement (`0054`, `0055`) : le TypeScript continue d'utiliser `sent_at` et
  ignore `dispatched_at` comme `job_deliveries` ; l'historique de l'outbox n'est pas rejoué.
- Aucun `time.time()` ni `datetime.now()` : horloge injectée (`Clock`) pour les délais et le
  planificateur, horloge de la base pour les baux et `dispatched_at`.
- Code Python en anglais hors `locale_fr` (`test_language_policy` vert).

## Commandes exécutées

```bash
uv run ruff check . && uv run ruff format --check packages-py apps
uv run mypy packages-py apps            # 83 fichiers, aucun probleme
uv run pytest packages-py apps -q       # 326 reussis
flock /tmp/learny-sdd-db.lock uv run pytest apps/worker-py/tests/integration -q
PLAYWRIGHT_REUSE_SERVER=0 flock /tmp/learny-sdd-db.lock corepack pnpm test:e2e --grep "@SPEC-2102\b"
node tools/sdd/validate.mjs SPEC-2102
```
