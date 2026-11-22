# SPEC-2207 — première tranche : portage des 9 cas d'usage de job

Date : 2026-11-22. Branche : `spec/SPEC-2207-bascule-jobs-crons-demos`. Base : `main` `c4d2467c`.
Périmètre : **seuls les cas d'usage appelés par les consommateurs et les crons** sont portés ici.
Le câblage du registre, les tâches du planificateur, la bascule `consumers`/`crons`, les routes
`dev.*`, l'e2e complet, `validate.mjs` et `complete.mjs` restent à faire (voir `handover.md`).

## 1. Cas d'usage portés dans cette tranche

| Cas d'usage | Contexte | Fichier Python | Source TypeScript | Tests |
|---|---|---|---|---|
| `purge_outbox` | shared | `learny/shared/outbox/purge.py` | `packages/jobs/src/functions/nightly-outbox-cleanup.ts` + `emit.ts#purgeSentEvents` | `tests/unit/shared/test_shared_jobs_purges.py`, `tests/integration/shared/test_shared_jobs_purge_outbox.py` |
| `purge_security_rows` | identity | `learny/identity/application/purge_security.py` | `packages/services/src/security/purge.ts` + `packages/db/src/repositories/security-purge.ts` | `tests/unit/shared/test_shared_jobs_purges.py`, `tests/integration/identity/test_identity_jobs_security_purge.py` |
| `purge_offline_receipts` | assessments | `learny/assessments/application/offline_purge.py` | `packages/jobs/src/functions/offline-receipts-purge.ts` | `tests/unit/shared/test_shared_jobs_purges.py`, `tests/integration/assessments/test_assessments_jobs_offline_purge.py` |
| `process_question_bank_jobs` | tutor | `learny/tutor/application/question_bank.py` | `packages/tutor/src/services/question-bank.ts#processQuestionBankJobs` | `tests/unit/tutor/test_tutor_jobs_question_bank.py`, `tests/integration/tutor/test_tutor_jobs_question_bank.py` |
| `prepare_question_bank` | tutor | `learny/tutor/application/question_bank.py` | `packages/jobs/src/functions/prepare-question-bank.ts` + `#enqueueCourseQuestionBanks` | idem |
| `plan_programme` | learning | `learny/learning/application/plan_programme.py` | `packages/jobs/src/functions/programme.ts` | `tests/unit/learning/test_learning_jobs_programme.py`, `tests/integration/learning/test_learning_jobs_plan_programme.py` |
| `grade_quiz` | assessments | `learny/assessments/application/grade_quiz.py` (+ `grade_open.py`) | `packages/jobs/src/functions/quiz-grade.ts`, `packages/services/src/quiz/{submit,grade-open}.ts` | `tests/unit/assessments/test_assessments_jobs_grade_open.py`, `tests/integration/assessments/test_assessments_jobs_grade_quiz.py` |
| `submit_exam_at_deadline` | assessments | `learny/assessments/application/exam_deadline.py` | `packages/jobs/src/functions/exam-deadline.ts` | `tests/unit/assessments/test_assessments_jobs_deadline.py`, `tests/integration/assessments/test_assessments_jobs_exam_deadline.py` |
| `unlock_module` | formation | `learny/formation/application/unlock_module.py` | `packages/jobs/src/functions/module-unlock.ts`, `packages/services/src/quiz/module-unlock.ts` | `tests/integration/formation/test_formation_jobs_unlock_module.py` |

Chaque cas d'usage est exposé par le `public.py` de son contexte (`purge_security_rows`,
`purge_offline_receipts`, `grade_quiz`, `grade_open_answers`, `submit_exam_at_deadline`,
`plan_programme`, `replan_formation_in_tx`, `replan_user_in_tx`, `prepare_question_bank`,
`process_question_bank_jobs`, `unlock_module`). `purge_outbox` vit dans `learny.shared.outbox`.

Réutilisation (ADR-2011 §4, aucune règle dupliquée) : `plan_schedule`/`ENGINE['planner']` (SPEC-407),
`reconcile_plan_slots`/`replan_formation_in_tx` (SPEC-411/618), `finalize_attempt`,
`apply_learning_result`, `create_notion_card`/`to_persistence_card` (FSRS), `validate_brick` +
`BrickReferenceResolver` (SPEC-501), `validate_candidate` du planificateur, `engagement.notify`,
`default_embedder` (Voyage/mock), `LlmGateway`.

## 2. Table des 23 consommateurs du plan P22 (§SPEC-2207, normative)

« Porté » = le cas d'usage Python existe et est testé ; « à câbler » = le consommateur ou la tâche
du planificateur doit être déclaré dans `consumers.py` / `scheduler.py` (tranche suivante).

| # | Fonction Inngest | Déclencheur | Cas d'usage Python | État |
|---|---|---|---|---|
| 1 | cron-hourly-tick | `5 * * * *` UTC | `expire_due_automation_actions` + `user/local-tick` + `cron/hourly-tick` | à câbler (tâche du planificateur) |
| 2 | cron-nightly | `30 1 * * *` UTC | émission de `cron/nightly{runDate}` | à câbler (tâche du planificateur) |
| 3 | account-deletion | cron/nightly | `privacy.run_account_deletions` | porté (SPEC-2206), à câbler |
| 4 | exports-purge | cron/nightly | `privacy.purge_exports` | porté (SPEC-2206), à câbler |
| 5 | nightly-outbox-cleanup | cron/nightly | `shared.purge_outbox` | **porté ici**, à câbler |
| 6 | offline-receipts-purge | cron/nightly | `assessments.purge_offline_receipts` | **porté ici**, à câbler |
| 7 | question-bank-nightly | cron/nightly | `tutor.process_question_bank_jobs` (limite 50) | **porté ici**, à câbler |
| 8 | security-purge | cron/hourly-tick | `identity.purge_security_rows` | **porté ici**, à câbler |
| 9 | notifications-daily-digest | cron/hourly-tick | `engagement.plan_daily_digests` → `job/daily-digest` | porté (SPEC-2205, à vérifier), à câbler |
| 10 | (nouveau, interne) | job/daily-digest | `engagement.send_daily_digest` | porté (SPEC-2205), événement à ajouter |
| 11 | notifications-deferred-due | cron/hourly-tick | `engagement.deliver_due_deliveries` | porté (SPEC-2205), à câbler |
| 12 | notifications-reminders | cron/hourly-tick | `engagement.sync_validation_quiz_reminders` | porté (SPEC-2205), à câbler |
| 13 | data-export | account/export-requested | `privacy.run_data_export` | porté (SPEC-2206), à câbler |
| 14 | email-welcome | user/signed-up | `engagement.send_welcome_email` | porté (SPEC-2205), à câbler |
| 15 | notification-delivery | notification/delivery-due | `engagement.deliver_notification` | porté (SPEC-2205), à câbler |
| 16 | ingest-resource | resource/uploaded | `content.process_resource` | porté (SPEC-2203), à câbler |
| 17 | generate-course | chapter/contributions-completed | `tutor.generate_course` | **non porté** (reste à porter, tranche suivante) |
| 18 | prepare-question-bank | course/generated | `tutor.prepare_question_bank` | **porté ici**, à câbler |
| 19 | plan-programme | formation/programme-validated | `learning.plan_programme` | **porté ici**, à câbler |
| 20 | quiz-grade | quiz/submitted | `assessments.grade_quiz` | **porté ici**, à câbler |
| 21 | exam-deadline | exam/started | `assessments.submit_exam_at_deadline` (`run_at = deadlineAt + 5 s`) | **porté ici**, à câbler |
| 22 | module-unlock | quiz/graded | `formation.unlock_module` | **porté ici**, à câbler |
| 23 | remediation-prepare / -requested | quiz/graded, remediation/requested | `tutor.prepare_remediation` (auto / manuel) | porté (via `assessments.prepare_remediation`), à câbler |

## 3. Les 6 crons à porter au planificateur

Les six fonctions déclenchées par un cron qui ne dépendent pas d'un événement métier, plus les
trois tâches horaires de notification (même déclencheur `cron/hourly-tick`) :

| Cron | Instant | Tâche du planificateur | Cas d'usage |
|---|---|---|---|
| nightly-outbox-cleanup | nightly | purge de l'outbox | `shared.purge_outbox` (porté ici) |
| offline-receipts-purge | nightly | purge des reçus hors ligne | `assessments.purge_offline_receipts` (porté ici) |
| question-bank-nightly | nightly | drainage de la banque | `tutor.process_question_bank_jobs` (porté ici) |
| account-deletion | nightly | suppressions dues | `privacy.run_account_deletions` (porté) |
| exports-purge | nightly | purge des exports | `privacy.purge_exports` (porté) |
| security-purge | hourly-tick | purge des tables de sécurité | `identity.purge_security_rows` (porté ici) |
| notifications-daily-digest | hourly-tick | plan des résumés | `engagement.plan_daily_digests` (porté) |
| notifications-deferred-due | hourly-tick | envois différés | `engagement.deliver_due_deliveries` (porté) |
| notifications-reminders | hourly-tick | rappels de quiz | `engagement.sync_validation_quiz_reminders` (porté) |

`api/ownership.yaml` déclare aujourd'hui deux crons (`cron/hourly-tick`, `cron/nightly`) et un
consommateur (`devtools.demo_job`), tous encore `ts` : rien n'a été basculé dans cette tranche.

## 4. Écarts trouvés et décisions

1. **`generate_course` absent.** Le plan P22 l'attribue à SPEC-2204 mais aucun cas d'usage Python
   n'existe (`content.generate_course_now` n'est que la demande HTTP). Le consommateur
   `generate-course` ne peut pas être câblé en l'état : inscrit dans `handover.md`.
2. **Expiration de l'outbox.** Le worker Python estampille `dispatched_at` et non `sent_at`
   (SPEC-2102) ; la purge supprime donc `coalesce(sent_at, dispatched_at) < now - 7 j`. Les lignes
   jamais distribuées (`sent_at` et `dispatched_at` nuls) sont conservées. Comportement observable
   identique pour les lignes distribuées, et cascade `job_deliveries` inchangée (FK `on delete
   cascade`).
3. **Motifs internes en anglais.** Les retours internes du job `plan-programme` (« formation
   absente », « programme vide », « déjà planifié ») ne sont jamais montrés : ils sont renommés
   `formation missing`, `empty programme`, `already planned` (ADR-2011 impose l'anglais hors
   `locale_fr`). Aucune conséquence observable.
4. **Textes utilisateur.** Les messages d'erreur, les libellés de correction (`Exact.`,
   `Pas tout à fait.`), le libellé de secours des distracteurs et les données de la notification
   `ai_task_failed` sont dans `locale_fr` (`assessments.py`, `tutor.py`, `details.py`), copiés mot
   pour mot du TypeScript. Le prompt de `grade-open` et les instructions des banques sont en
   anglais, comme le veut ADR-2011 pour les prompts (`packages/tutor/prompts/*.md` sont anglais) ;
   les scénarios de simulation sont explicites, donc la sélection de fixture est inchangée.
5. **Bornes.** `process_question_bank_jobs` borne le lot à `max(1, min(50, limite))` (défaut 20) ;
   `purge_*` utilisent une comparaison stricte (`<`) sur l'instant injecté ; `grade_quiz` garde
   l'état par tentative (`submitted`/`graded`) ; `unlock_module` garde l'état par module validé ;
   `submit_exam_at_deadline` planifie `deadlineAt + 5 s` sans jamais planifier dans le passé.
6. **Nouveaux appelants privilégiés.** `shared/outbox/purge`, `identity/purge_security`,
   `assessments/offline_purge`, `learning/plan_programme`, `formation/unlock_module` et
   `tutor/question_bank` sont déclarés dans `learny/shared/db/privileged.py` avec leur motif
   (transactions de service des jobs, comme les jobs SPEC-2205/2206 déjà portés).
7. **Point d'entrée du planning.** `plan_programme` calcule `hours = max(1, floor(volume / modules))`
   comme `programme.ts` ; il n'utilise pas `_planner_formation` (qui arrondit au plus proche) pour
   ne pas changer les créneaux produits au moment de la validation.
8. **Replanification après déblocage.** `replan_user_in_tx` est ajouté à
   `learning/application/planning.py` et réutilise `plan_schedule` + `reconcile_plan_slots` : la
   pause (SPEC-618) garde son propre appel, aucun comportement existant n'est modifié.
