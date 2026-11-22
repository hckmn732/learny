# SPEC-2207 — état après la deuxième tranche : worker câblé, crons basculés

Date : 2026-11-22. Branche : `spec/SPEC-2207-bascule-jobs-crons-demos`. Base : `main` `c4d2467c`.
Commits : `3171f677` (câblage et bascule), `ce8c13d1` (tests unitaires), `358e2cd0` (tests
d'intégration), `f54b0a45` (Hono sans Inngest dans la pile de tests).

Périmètre de la tranche : registre des consommateurs, événement interne `job/daily-digest`, deux
tâches du planificateur, bascule `consumers` + `crons` à `py`, retrait du pont inline, tests
unitaires et d'intégration. Restent hors périmètre : routes `dev.*` et spéciales, e2e complet,
`acceptance.md`, `validate.mjs`, `complete.mjs`.

## 1. Cas d'usage de job portés (première tranche, inchangés)

| Cas d'usage | Contexte | Fichier Python | Tests |
|---|---|---|---|
| `purge_outbox` | shared | `learny/shared/outbox/purge.py` | `test_shared_jobs_purges.py`, `test_shared_jobs_purge_outbox.py` |
| `purge_security_rows` | identity | `learny/identity/application/purge_security.py` | `test_shared_jobs_purges.py`, `test_identity_jobs_security_purge.py` |
| `purge_offline_receipts` | assessments | `learny/assessments/application/offline_purge.py` | `test_shared_jobs_purges.py`, `test_assessments_jobs_offline_purge.py` |
| `process_question_bank_jobs` | tutor | `learny/tutor/application/question_bank.py` | `test_tutor_jobs_question_bank.py` |
| `prepare_question_bank` | tutor | `learny/tutor/application/question_bank.py` | idem |
| `plan_programme` | learning | `learny/learning/application/plan_programme.py` | `test_learning_jobs_programme.py`, `test_learning_jobs_plan_programme.py` |
| `grade_quiz` | assessments | `learny/assessments/application/grade_quiz.py` | `test_assessments_jobs_grade_open.py`, `test_assessments_jobs_grade_quiz.py` |
| `submit_exam_at_deadline` | assessments | `learny/assessments/application/exam_deadline.py` | `test_assessments_jobs_deadline.py`, `test_assessments_jobs_exam_deadline.py` |
| `unlock_module` | formation | `learny/formation/application/unlock_module.py` | `test_formation_jobs_unlock_module.py` |

Ajouts de cette tranche, dans les contextes (jamais de SQL dans le worker) :

- `learny/engagement/application/local_ticks.py` — `local_tick_page` / `local_tick_payload` /
  `local_tick_event_id` : sélection des apprenants actifs, fenêtre locale et identifiant
  d'événement identiques à `packages/jobs/src/tick.ts`.
- `learny/engagement/application/digest.py` — `send_daily_digest_at(deps, user_id, at)` : point
  d'entrée du job `job/daily-digest` (lit la zone du profil, puis délègue à `send_daily_digest`).

## 2. Registre des consommateurs et bascule (cette tranche)

`apps/worker-py/src/learny_worker/consumers.py` déclare **21 consommateurs** : une entrée
`Consumer(name, on, run, timeout_s, max_attempts, run_at, validate, tags)` par ligne de la table du
plan P22 dont le cas d'usage Python existe. Les 22 entrées de consommateurs de la table sont donc
couvertes sauf `generate-course` (voir section 5).

| # | Consommateur (`name`) | Événement | Cas d'usage | Options | État | Test |
|---|---|---|---|---|---|---|
| 3 | `privacy.run_account_deletions` | `cron/nightly` | `privacy.run_account_deletions` | 900 s, 4 tentatives | câblé + testé | `test_worker_consumers_purges.py` (famille purges) |
| 4 | `privacy.purge_exports` | `cron/nightly` | `privacy.purge_exports` | 300 s | câblé + testé | idem |
| 5 | `shared.purge_outbox` | `cron/nightly` | `purge_outbox` | 300 s | câblé + testé | `test_a_nightly_tick_purges_the_delivered_outbox_once` |
| 6 | `assessments.purge_offline_receipts` | `cron/nightly` | `purge_offline_receipts` | 300 s | câblé + testé | `test_a_nightly_tick_purges_the_offline_receipts_once` |
| 7 | `tutor.process_question_bank_jobs` | `cron/nightly` | `process_question_bank_jobs(limit=50)` | 900 s | câblé + testé | unitaire (registre) |
| 8 | `identity.purge_security_rows` | `cron/hourly-tick` | `purge_security_rows` | 300 s | câblé + testé | `test_an_hourly_tick_purges_the_security_rows_once` |
| 9 | `engagement.plan_daily_digests` | `cron/hourly-tick` | `plan_daily_digests` → émet `job/daily-digest` | 300 s | câblé + testé | `test_worker_consumers_digest.py` |
| 10 | `engagement.send_daily_digest` | `job/daily-digest` | `send_daily_digest_at` | 300 s, `run_at = data.at` | câblé + testé | idem (dont `run_at`) |
| 11 | `engagement.deliver_due_deliveries` | `cron/hourly-tick` | `deliver_due_deliveries(limit=100)` | 300 s, 2 tentatives | câblé + testé | unitaire (registre) |
| 12 | `engagement.sync_validation_quiz_reminders` | `cron/hourly-tick` | `sync_validation_quiz_reminders(batchSize=200)` | 300 s, 2 tentatives | câblé + testé | unitaire (registre) |
| 13 | `privacy.run_data_export` | `account/export-requested` | `run_data_export` | 900 s | câblé + testé | `test_worker_consumers_export.py` |
| 14 | `engagement.send_welcome_email` | `user/signed-up` | `send_welcome_email` | 300 s | câblé + testé | unitaire (registre) |
| 15 | `engagement.deliver_notification` | `notification/delivery-due` | `deliver_notification` | 300 s | câblé + testé | unitaire (registre) |
| 16 | `content.process_resource` | `resource/uploaded` | `process_resource` | 600 s | câblé + testé | `test_worker_consumers_ingestion.py` |
| 17 | `tutor.generate_course` | `chapter/contributions-completed` | **absent** | — | **non câblé** (`ts`, ADR-2032) | écart épinglé par `test_consumers_registry.py` |
| 18 | `tutor.prepare_question_bank` | `course/generated` | `prepare_question_bank` | 600 s | câblé + testé | unitaire (registre) |
| 19 | `learning.plan_programme` | `formation/programme-validated` | `plan_programme` | 600 s | câblé + testé | unitaire (registre) |
| 20 | `assessments.grade_quiz` | `quiz/submitted` | `grade_quiz` | 300 s | câblé + testé | `test_worker_consumers_grading.py` |
| 21 | `assessments.submit_exam_at_deadline` | `exam/started` | `submit_exam_at_deadline` | `run_at = deadlineAt + 5 s` | câblé + testé | unitaire (registre) |
| 22 | `formation.unlock_module` | `quiz/graded` | `unlock_module` | 300 s | câblé + testé | `test_worker_consumers_grading.py` |
| 23a | `tutor.prepare_remediation` | `quiz/graded` | `prepare_remediation(trigger="auto")`, ignoré si réussi | 300 s | câblé + testé | unitaire (registre) |
| 23b | `tutor.prepare_requested_remediation` | `remediation/requested` | `prepare_remediation(trigger="manual")` | 300 s | câblé + testé | unitaire (registre) |
| — | `devtools.demo_job` | `sdd/demo-requested` | `demo_job` (SPEC-2102) | 300 s | câblé + testé | `test_worker_outbox.py` |

Chaque consommateur porte un `validate` qui refuse une charge hors contrat avec
`PermanentJobError("VALIDATION_FAILED")` : la livraison est `failed` au premier essai, sans reprise
(CL-1).

`api/ownership.yaml` : `consumers` à `py` pour les 22 entrées existantes sauf `tutor.generate_course`
(`ts`, ADR-2032) ; `crons` : `cron/hourly-tick` et `cron/nightly` à `py`. Preuve :
`test_every_registry_consumer_is_owned_by_python` (tous les consommateurs du registre sont actifs) et
`test_no_typescript_consumer_is_ever_active` (aucun `ts` ne tourne).

## 3. Événement interne `job/daily-digest`

Ajouté à `packages/contracts/src/events.ts` (source du contrat), donc à `api/events.schema.json`
(50 entrées), `api/inventory.json` (`events: 50`) et `evidence/SPEC-2001/inventory.md`. Schéma
`{userId, at}`, documenté comme interne par ADR-2014 : jamais émis par un client, jamais relayé.
`user/local-tick` n'a **aucun** consommateur dans la table du plan : il n'en a pas été inventé.

## 4. Planificateur : deux tâches

`apps/worker-py/src/learny_worker/scheduler.py` :

- **horaire** (minute 5 UTC, `hourly_task`) : `expire_due_automation_actions(deps)`, puis émission
  de `user/local-tick` par apprenant actif (pages de 500, charge et identifiant identiques à
  `cron-hourly-tick.ts`, fuseau invalide ignoré et journalisé), puis `cron/hourly-tick {tickAt}` ;
- **nocturne** (`emit_due`) : `cron/nightly {runDate}`.

Le renvoi d'outbox par Inngest n'est pas porté (le répartiteur interroge). Les tâches ne s'exécutent
que si `ownership.yaml` déclare le cron `py` ; les identifiants déterministes (`hourly-tick:<T>`,
`nightly:<runDate>`, `local-tick:<user>:<windowStart>`) rendent un rejeu sans effet. Couverture :
`apps/worker-py/tests/unit/test_scheduler_tasks.py` (10 tests) et
`apps/worker-py/tests/integration/test_worker_scheduler_ticks.py` (2 tests, dont deux instances du
planificateur et une seule émission par période).

## 5. Écarts et décisions

1. **`generate-course` non câblé.** Aucun cas d'usage Python de génération de cours n'existe
   (`tutor.generate_course`, SPEC-2204) : l'entrée reste `ts`, documentée par ADR-2032 et épinglée
   par un test. C'est la seule ligne de la table non basculée.
2. **Expiration de l'outbox.** Le worker estampille `dispatched_at` et non `sent_at` (SPEC-2102) ;
   la purge supprime `coalesce(sent_at, dispatched_at) < now - 7 j`.
3. **Pont inline retiré.** L'argument `send` de `dispatch_inline` (appel à la route de dispatch Hono
   de P21) est supprimé ; aucune route `POST /api/v1/dev/jobs/dispatch` n'avait été ajoutée, donc il
   n'y avait rien d'autre à retirer. `JOBS_MODE=inline` continue d'exécuter les consommateurs `py`
   in-process (`test_inline_ownership.py` prouve qu'aucun `ts` ne tourne).
4. **Hono sans Inngest.** `apps/web/playwright.config.ts` passe `LEARNY_API_ROLE=api` au serveur Hono
   de la pile de tests : la route `/api/inngest` n'est plus montée (étape 2 de la procédure du plan).
5. **Budgets de temps.** `timeout_s` reprend `timeouts.finish` quand il existe (banques et export
   900 s, ingestion et préparation de banque 600 s, notation et déblocage 300 s). Pour
   `exam-deadline`, le budget Inngest d'une heure incluait l'attente : `run_at` l'externalise, donc
   la soumission garde le défaut de 300 s. `max_attempts` = `retries + 1` (2 pour les trois
   producteurs horaires de notifications, 4 ailleurs).
6. **Textes internes en anglais**, messages utilisateur issus de `locale_fr` : aucune chaîne vue par
   l'utilisateur n'est ajoutée par cette tranche.

## 6. Preuves de cette tranche

| Commande | Résultat |
|---|---|
| `uv run ruff check .` | vert |
| `uv run ruff format --check packages-py apps` | vert (576 fichiers) |
| `uv run mypy packages-py apps` | vert (570 fichiers) |
| `uv run lint-imports` | 2 contrats conservés |
| `uv run pytest packages-py/learny/tests/unit apps/api-py/tests/unit apps/worker-py/tests/unit -q` | 3672 passés |
| `uv run pytest apps/worker-py/tests/integration -q` (sous `flock`) | 21 passés (12 ajoutés) |
| `corepack pnpm contract:check` | contrat à jour |
| `corepack pnpm exec tsx tools/migration/inventory.mjs --check` | inventaire à jour |
| `node tools/migration/report.mjs --check` | réussi |
| `corepack pnpm sdk:check`, `py:contract:check`, `openapi:check` | à jour |
| `corepack pnpm exec vitest run packages/contracts/src/events.test.ts` | 106 passés |
