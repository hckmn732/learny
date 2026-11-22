# SPEC-2207 — état après la troisième tranche : `tutor.generate_course` porté, plus aucun consommateur `ts`

Date : 2026-11-22. Branche : `spec/SPEC-2207-bascule-jobs-crons-demos`. Base : `main` `c4d2467c`.
Commits : `3171f677` (câblage et bascule), `ce8c13d1` (tests unitaires), `358e2cd0` (tests
d'intégration), `f54b0a45` (Hono sans Inngest dans la pile de tests), puis cette tranche :
`c0cb05f7` (ADR-2033), `d11bbabc` (exports TS pour l'oracle), `1c19af5c` (domaine Python),
`685a2181` (oracle et jumeau pytest), `9d3f72fd` (cas d'usage et dernier consommateur basculé),
`348330af` (intégration du consommateur).

Périmètre des trois tranches : registre des consommateurs, événement interne `job/daily-digest`, deux
tâches du planificateur, bascule `consumers` + `crons` à `py`, retrait du pont inline, portage de
`tutor.generate_course`, tests unitaires et d'intégration. Restent hors périmètre : routes `dev.*` et
spéciales, e2e complet, `acceptance.md`, `validate.mjs`, `complete.mjs`.

## 1. Cas d'usage de job portés

| Cas d'usage | Contexte | Fichier Python | Tests |
|---|---|---|---|
| `purge_outbox` | shared | `learny/shared/outbox/purge.py` | `test_shared_jobs_purges.py`, `test_shared_jobs_purge_outbox.py` |
| `purge_security_rows` | identity | `learny/identity/application/purge_security.py` | `test_shared_jobs_purges.py`, `test_identity_jobs_security_purge.py` |
| `purge_offline_receipts` | assessments | `learny/assessments/application/offline_purge.py` | `test_shared_jobs_purges.py`, `test_assessments_jobs_offline_purge.py` |
| `process_question_bank_jobs` | tutor | `learny/tutor/application/question_bank.py` | `test_tutor_jobs_question_bank.py` |
| `prepare_question_bank` | tutor | `learny/tutor/application/question_bank.py` | idem |
| `generate_course` | tutor | `learny/tutor/application/generate_course.py` | `test_tutor_course_domain.py`, `test_worker_consumers_course.py` |
| `plan_programme` | learning | `learny/learning/application/plan_programme.py` | `test_learning_jobs_programme.py`, `test_learning_jobs_plan_programme.py` |
| `grade_quiz` | assessments | `learny/assessments/application/grade_quiz.py` | `test_assessments_jobs_grade_open.py`, `test_assessments_jobs_grade_quiz.py` |
| `submit_exam_at_deadline` | assessments | `learny/assessments/application/exam_deadline.py` | `test_assessments_jobs_deadline.py`, `test_assessments_jobs_exam_deadline.py` |
| `unlock_module` | formation | `learny/formation/application/unlock_module.py` | `test_formation_jobs_unlock_module.py` |

Ajouts de la deuxième tranche, dans les contextes (jamais de SQL dans le worker) :

- `learny/engagement/application/local_ticks.py` — `local_tick_page` / `local_tick_payload` /
  `local_tick_event_id` : sélection des apprenants actifs, fenêtre locale et identifiant
  d'événement identiques à `packages/jobs/src/tick.ts`.
- `learny/engagement/application/digest.py` — `send_daily_digest_at(deps, user_id, at)` : point
  d'entrée du job `job/daily-digest` (lit la zone du profil, puis délègue à `send_daily_digest`).

Ajouts de cette tranche :

- `learny/tutor/domain/course.py` (941 lignes) — la moitié pure du pipeline de
  `packages/tutor/src/course/generate.ts` : validation et normalisation d'un plan de cours (règles
  BR-COU-02 à BR-COU-06), sélection des passages dans le budget de contexte de la tâche `course`
  (24 000 jetons), ancre unique d'une section, `data` et texte d'une section, média d'une
  citation, ordre canonique des extrémités d'un lien, identifiants déterministes de la version et
  des deux notifications, substitution des placeholders d'une fixture.
- `learny/tutor/domain/course_prompt.py` (189 lignes) — le prompt du chapitre : `course.md`
  versionné lu au démarrage, partie profil, contrat JSON du chapitre, puis un seul message de
  données où les apports restent dans des balises `<document>` (ADR-0023). `format.py` gagne
  `escape_tutor_data`, le pendant exact d'`escapeTutorData`.
- `learny/tutor/application/generate_course.py` (973 lignes) — le pipeline complet : instantané
  du module sous RLS, un appel structuré par chapitre (deux corrections au plus), double
  vérification des citations, publication atomique de la version, `course/generated` dans l'outbox
  de la même transaction, notifications après le commit.

## 2. Registre des consommateurs et bascule (deuxième et troisième tranches)

`apps/worker-py/src/learny_worker/consumers.py` déclare **22 consommateurs** : une entrée
`Consumer(name, on, run, timeout_s, max_attempts, run_at, validate, tags)` par ligne de la table du
plan P22. Les 22 entrées de consommateurs de la table sont couvertes, plus la démonstration
`devtools.demo_job`.

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
| 17 | `tutor.generate_course` | `chapter/contributions-completed` | `generate_course` | 600 s, 4 tentatives | câblé + testé | `test_worker_consumers_course.py` (4 cas) |
| 18 | `tutor.prepare_question_bank` | `course/generated` | `prepare_question_bank` | 600 s | câblé + testé | `test_worker_consumers_course.py` |
| 19 | `learning.plan_programme` | `formation/programme-validated` | `plan_programme` | 600 s | câblé + testé | unitaire (registre) |
| 20 | `assessments.grade_quiz` | `quiz/submitted` | `grade_quiz` | 300 s | câblé + testé | `test_worker_consumers_grading.py` |
| 21 | `assessments.submit_exam_at_deadline` | `exam/started` | `submit_exam_at_deadline` | `run_at = deadlineAt + 5 s` | câblé + testé | unitaire (registre) |
| 22 | `formation.unlock_module` | `quiz/graded` | `unlock_module` | 300 s | câblé + testé | `test_worker_consumers_grading.py` |
| 23a | `tutor.prepare_remediation` | `quiz/graded` | `prepare_remediation(trigger="auto")`, ignoré si réussi | 300 s | câblé + testé | unitaire (registre) |
| 23b | `tutor.prepare_requested_remediation` | `remediation/requested` | `prepare_remediation(trigger="manual")` | 300 s | câblé + testé | unitaire (registre) |
| — | `devtools.demo_job` | `sdd/demo-requested` | `demo_job` (SPEC-2102) | 300 s | câblé + testé | `test_worker_outbox.py` |

Chaque consommateur porte un `validate` qui refuse une charge hors contrat avec
`PermanentJobError("VALIDATION_FAILED")` : la livraison est `failed` au premier essai, sans reprise
(CL-1). `tutor.generate_course` porte un validateur dédié, parce que `chapterId` est nullable dans le
contrat ; les autres utilisent `payload_validator`.

`api/ownership.yaml` : **toutes** les entrées `consumers` et les deux `crons` sont à `py`. Preuve :
`test_every_registry_consumer_is_owned_by_python`, `test_no_consumer_is_left_to_typescript` et
`test_no_typescript_consumer_is_ever_active`.

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

1. **Plus aucun consommateur `ts`.** ADR-2032 documentait l'écart de `generate-course` ; le portage
   de cette tranche le ferme et ADR-2033 consigne l'extraction mécanique que l'oracle a exigée dans
   `packages/tutor/src/course/generate.ts` (deux règles pures écrites en ligne, déplacées à
   l'identique ; quinze `export` ajoutés ; `vitest --project unit packages/tutor` 36/36).
2. **Notifications : appel direct à `notify`.** Le TypeScript émettait `notification/requested` ;
   le Python suit la convention de `learny/engagement/public.py` (BR-NOT-03, déjà appliquée par
   `unlock_module`, `grade_quiz`, `plan_programme` et l'export) : `engagement.notify` est appelé
   après le commit, et un échec de notification est journalisé sans faire échouer la livraison. Un
   événement `notification/requested` sans consommateur Python n'aurait, lui, jamais été délivré.
   Les deux charges (`course_ready`, `ai_task_failed`), les clés de déduplication
   (`course-ready:<courseId>`, `course-failed:<moduleId>:<version>`) et les textes sont ceux du
   TypeScript.
3. **Reprise de `generate_course`.** Sans moteur d'étapes : l'entrée rend la version déjà publiée de
   sa clé avant tout appel au modèle, la transaction de publication la relit sous verrou consultatif,
   les passages cités sont relus juste avant publication (une source supprimée n'est jamais publiée),
   et un échec non rejouable persiste une version `failed` de la clé, donc une redélivrance ne fait
   rien. C'est exactement l'atomicité du TypeScript, dont tout le pipeline tient dans un seul
   `step.run` : Inngest ne reprenait pas non plus au milieu des chapitres.
4. **Expiration de l'outbox.** Le worker estampille `dispatched_at` et non `sent_at` (SPEC-2102) ;
   la purge supprime `coalesce(sent_at, dispatched_at) < now - 7 j`.
5. **Pont inline retiré.** L'argument `send` de `dispatch_inline` (appel à la route de dispatch Hono
   de P21) est supprimé ; aucune route `POST /api/v1/dev/jobs/dispatch` n'avait été ajoutée, donc il
   n'y avait rien d'autre à retirer. `JOBS_MODE=inline` continue d'exécuter les consommateurs `py`
   in-process (`test_inline_ownership.py` prouve qu'aucun `ts` ne tourne).
6. **Hono sans Inngest.** `apps/web/playwright.config.ts` passe `LEARNY_API_ROLE=api` au serveur Hono
   de la pile de tests : la route `/api/inngest` n'est plus montée.
7. **Budgets de temps.** `timeout_s` reprend `timeouts.finish` quand il existe (banques, export et
   génération de cours 900/900/600 s, ingestion 600 s, notation et déblocage 300 s). Pour
   `exam-deadline`, le budget Inngest d'une heure incluait l'attente : `run_at` l'externalise, donc
   la soumission garde le défaut de 300 s. `max_attempts` = `retries + 1` (2 pour les trois
   producteurs horaires de notifications, 4 ailleurs, dont `generate_course` qui déclare
   `retries: 3`).
8. **Tranche d'un caractère astral.** `js_slice` coupe sur une frontière de point de code ; là où
   TypeScript renverrait un demi-surrogate (limite au milieu d'un caractère astral), le portage garde
   le caractère entier. Ce cas, impossible à stocker en UTF-8, est absent du fixture et documenté
   dans le module ; il ne concerne qu'un titre de ressource coupé au milieu d'un emoji.
9. **Textes internes en anglais**, messages utilisateur issus de `locale_fr` : les textes du prompt
   de chapitre et du domaine ajoutés par cette tranche sont dans `locale_fr`, à l'identique du
   TypeScript.

## 6. Preuves

| Commande | Résultat |
|---|---|
| `uv run ruff check .` | vert |
| `uv run ruff format --check packages-py apps` | vert (581 fichiers) |
| `uv run mypy packages-py apps` | vert (574 fichiers) |
| `uv run lint-imports` | 2 contrats conservés |
| `uv run pytest packages-py/learny/tests/unit apps/api-py/tests/unit apps/worker-py/tests/unit -q` | 3 775 passés, 1 échec corrigé (politique de langue) → 3 776 |
| `uv run pytest packages-py/learny/tests/unit/tutor/test_tutor_course_domain.py -q` | 99 passés |
| `uv run pytest apps/worker-py/tests/integration -q` (sous `flock`) | 25 passés (4 ajoutés) |
| `corepack pnpm exec tsx tools/oracles/course-vectors.mts --check` | fixture à jour |
| `corepack pnpm exec vitest run --project unit packages/tutor` | 36 passés |
| `corepack pnpm exec tsc -p tsconfig.tools.json --noEmit` | vert |
| `corepack pnpm exec eslint --max-warnings=0 tools packages/tutor/src/course/generate.ts` | vert |
| `corepack pnpm exec tsx tools/migration/inventory.mjs --check` | inventaire à jour (217 opérations) |
| `corepack pnpm contract:check`, `sdk:check`, `py:contract:check`, `openapi:check` | à jour (aucun contrat touché) |

## 7. Quatrième tranche : routes `dev.*` servies par Python (18/70)

Date : 2026-11-22. Commits : `cb6e85eb` (registre des spéciales, `dev.echo`, `dev.items`),
`809d1e99` (`dev.rateLimit.*`), `55d79788` (`dev.email.*`), `9bc2aaca` (`dev.stripe.*`),
`3126a962` (`dev.uploadSimulation`), `4c560c9c` (`dev.events.*`, `dev.cron.hourlyTick`).

`api/ownership.yaml` porte **70** opérations `dev.*` (le chiffre 72 de la commande comptait aussi les
deux routes `_dev` hors périmètre) et **26** routes spéciales `dev/sdd`, dont 25 sont des opérations
`dev.*` et `relay-stream`. **18 opérations** sont passées à `py` dans cette tranche, avec leurs clés
spéciales :

| Famille | Opérations | Module |
|---|---|---|
| écho et pagination | `dev.echo`, `dev.items` | `special/dev_echo.py` |
| limitation de débit | `dev.rateLimit.burst`, `origin`, `purge` | `special/dev_rate_limit.py` |
| e-mail | `dev.email.preview`, `send`, `outbox`, `outbox.purge` | `special/dev_email.py` |
| Stripe simulé | `dev.stripe.checkoutPay`, `checkoutCancel`, `events`, `simulate` | `special/dev_stripe.py` |
| limites d'envoi | `dev.uploadSimulation` | `special/dev_upload.py` |
| jobs et tick | `dev.events.demo.start`, `demo.run`, `outbox`, `dev.cron.hourlyTick` | `special/dev_events.py` |

Architecture de la tranche (conforme au plan P22, section « Dev/demo routes ») :

- `apps/api-py/src/learny_api/special/__init__.py` : registre des routes spéciales. Les 25 routes de
  développement sont installées **avant** le pipeline et avant le relais ; la garde
  `ENABLE_SDD_PAGES` (`true` ou `1`) et `APP_ENV != production` répond le même problem+json 404 que
  `devOnly`, avant toute authentification (`RESOURCE_NOT_FOUND` dans `locale_fr/details.py`).
- `pipeline.install` n'installe plus une opération dont la clé spéciale est `py` : c'est le registre
  qui la sert, avec la garde. Les handlers restent déclarés (`handlers/dev.py`) et
  `test_handlers.py` continue d'imposer `py_operations == HANDLERS`.
- Les corps des routes sont des fonctions minces de `special/dev_*.py` ; les cas d'usage réutilisables
  sont portés dans le contexte propriétaire et exportés par son `public.py` :
  `engagement.application.dev_email` (+ fixtures de gabarits dans
  `locale_fr/engagement_email_fixtures.py`), `billing.application.dev`,
  `content.application.dev_uploads`, `identity.application.purge_security.purge_rows_in_tx`.
- `service_tx` est déclaré dans `learny/shared/db/privileged.py` pour `special.dev_rate_limit` et
  `special.dev_events` (seaux et lignes synthétiques, utilisateurs de fabrique, compteurs d'outbox).
- Tests d'intégration par famille (`packages-py/learny/tests/integration/dev/`) : réponse nominale et
  garde de développement (désactivée, valeur non canonique, production). Harnais commun :
  `packages-py/learny/tests/dev_route_support.py`.

Restent hors de cette tranche : **52 opérations `dev.*`** — `dev.notificationsGenerate`,
`dev.notify`, `dev.pushSend`, `dev.personal-data.{deletion.schedule,deletion.cancel,execute,export}`
et les **45 `dev.sdd.*`** (spec-007 à spec-1301, `dev.sddApiCoverage`, `dev.sddAuthProxy`,
`dev.sdd.stripe.session`) — plus `auth.*`, `health.get`, `home.get`, `formations.resume`, les routes
spéciales hors `dev.*`, l'e2e complet, `acceptance.md`, `validate.mjs` et `complete.mjs`.
