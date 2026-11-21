# Périmètre — SPEC-2202 (learning + assessments)

Source unique : `api/inventory.json` (généré par SPEC-2001), filtré sur `context == "learning"`
et `context == "assessments"`. L’inventaire fait foi (ADR-2005, ADR-1001) : il contient
**41 opérations** — 15 learning et 26 assessments —
dont **0** sont déjà `py` dans `api/ownership.yaml` au démarrage (toutes `ts`).

## État de la bascule

| Contexte | Opérations | `py` | `ts` restantes | Motif des `ts` |
|---|---|---|---|---|
| learning | 15 | 11 | 4 | `apply-result.ts` (1338 lignes) et le service `review` (2598 lignes) restent à porter : `warmups.answers.create`, `review.globalQuizToday`, `review.answer`, `review.complete` |
| assessments | 26 | 0 | 26 | domaine à porter (étape 2) |
| **Total** | **41** | **11** | **30** | |

## Comptage

| Contexte | Opérations | Routes spéciales | Consommateurs (jobs) | Crons |
|---|---|---|---|---|
| learning | 15 | 0 | 2 (quiz-grade, plan-programme) | 0 |
| assessments | 26 | 0 | 3 (exam-deadline, remediation-prepare, offline-receipts-purge) | 1 (offline-receipts-purge) |
| **Total** | **41** | **0** | **5** | **1** |

Les 32 routes spéciales de l’inventaire appartiennent toutes à SPEC-2207 : hors périmètre.
Les consommateurs et crons restent `ts` jusqu’à SPEC-2207 (ADR-2014) ; leurs cas d’usage sont
portés et testés ici (EF-1) mais le branchement au worker est fait en SPEC-2207.

## Avancement du portage (état de la branche)

Étape 2 du plan P22 (domaine pur) **livrée** : moteur d'apprentissage complet (planificateur
compris) et contrat des briques complet (schémas, règles, correction par le code, empreinte, payload
public, mélange déterministe). Les tests d'intégration du moteur sont portés (49 cas) ainsi que les
jeux de démonstration.

Étape 3 **avancée** : 11 des 15 opérations `learning` sont servies par Python et basculées dans
`api/ownership.yaml`. Les requêtes SQL, les cas d'usage et les handlers de `agenda.get`,
`gaps.list`, `series.streak`, `series.milestones`, `formations.finalReview`,
`formations.maintenance`, `slots.alternatives`, `slots.move`, `formations.replan-options`,
`formations.replan` et `warmups.today.get` sont livrés avec leurs tests d'intégration serveur.
Les quatre opérations restantes (`warmups.answers.create`, `review.globalQuizToday`,
`review.answer`, `review.complete`) restent `ts` : elles dépendent du portage complet de
`packages/services/src/learning/apply-result.ts` (FSRS, maîtrise, lacunes, journal) et du service
`review`, hors de la tranche. Aucune n'est enregistrée comme handler, donc
`apps/api-py/tests/unit/test_handlers.py` reste vert.

Dette explicite : `series.milestones` insère le jalon de façon idempotente mais n'émet pas la
notification `milestone` de SPEC-209 ; le service `notify` (routage, plafond quotidien, modèles
d'e-mail) relève du contexte engagement du P23 et n'est pas encore porté. Ce n'est pas observable
par la parité HTTP et le jalon lui-même est conservé.

Parité : `pnpm parity:record --group learning` puis `parity:check` sur la façade donnent
**4 scénarios, 0 divergence** (`evidence/SPEC-2202/parity.md`). Les opérations à paramètre de
chemin et les mutations ne sont pas générées par l'outil ; elles sont couvertes par les tests
d'intégration serveur.

| Module du domaine | État | Preuve |
|---|---|---|
| `learny/shared/prng.py` (PRNG ensemencé) | porté | `tests/unit/learning-engine/test_random.py` |
| `learny/shared/time.py` (fuseaux, jour civil, lecture décalée) | porté | `tests/unit/learning-engine/test_time.py` |
| `learny/learning/domain/params.py` (`ENGINE`) | porté | `tests/unit/learning-engine/test_params.py` |
| `learny/learning/domain/fsrs.py` (FSRS 5.4.2, médiane, note) | porté | `tests/unit/learning-engine/test_review.py` |
| `learny/learning/domain/mastery.py` | porté | `tests/unit/learning-engine/test_calculate.py` |
| `learny/learning/domain/retention.py` | porté | `tests/unit/learning-engine/test_retention.py` |
| `learny/learning/domain/progress.py` | porté | `tests/unit/learning-engine/test_metrics.py` |
| `learny/learning/domain/streak.py` (série et jalons) | porté | `tests/unit/learning-engine/test_calculate.py` |
| `learny/learning/domain/gaps.py` | porté | `tests/unit/learning-engine/test_detect.py` |
| `learny/learning/domain/global_quiz.py` (session, lissage, format) | porté | `tests/unit/learning-engine/test_build_daily_session.py` |
| `learny/learning/domain/warmup.py` | porté | `tests/unit/learning-engine/test_select.py` |
| `learny/learning/domain/draw.py` | porté | `tests/unit/learning-engine/test_draw_attempt.py` |
| `learny/learning/domain/planner.py` (`planSchedule`, `findCompatibleSlots`, `replan`) | porté | `tests/unit/learning-engine/test_plan.py`, `test_plan_validation.py` |
| `learny/learning/domain/types.py` (`assert_availability`, CL-6 et CL-9) | porté | `tests/unit/learning-engine/test_types.py` |
| `learny/assessments/domain/bricks/` — schémas des 13 types, règles internes, registre, références, validation | porté | `tests/unit/assessments/test_schema.py`, `test_bricks_validation.py`, `test_registry.py` |
| `learny/assessments/domain/bricks/` — normalisation, SHA-256, mélange, empreinte, payload public | porté | `tests/unit/assessments/test_normalize.py`, `test_sha256.py`, `test_bricks_random.py`, `test_fingerprint.py`, `test_public.py` |
| `learny/assessments/domain/bricks/` — correction par le code des six types | porté | `tests/unit/assessments/test_grade.py` |
| `learny/assessments/domain/bricks/` — réponse d'exercice, contrôle de tableau, minuteur, barème | porté | `tests/unit/assessments/test_helpers.py` |

Détail des cas, fixtures d'oracle et restes : `evidence/SPEC-2202/test-port-map.md`. Legende : `[x]` servie et basculee, `[~]` requetes, cas d'usage et tests livres mais handler et bascule en attente de parite, `[ ]` reste a porter.

## Opérations du périmètre (liste cochable)

### learning (15)

| Fait | Opération | Méthode | Chemin | Propriétaire | Implémentation TS | Tables | Tests TS |
|---|---|---|---|---|---|---|---|
| [x] | `agenda.get` | GET | `/api/v1/agenda` | py | `agenda.ts` | formations, group_members, groups, modules, profiles, schedule_slots, study_preferences | `agenda.spec.ts`, `spec-705.spec.ts`, `schema.test.ts`, `agenda.test.ts` |
| [x] | `formations.finalReview` | GET | `/api/v1/formations/:fid/final-review` | py | `final-review.ts` | formations, group_members, groups, milestones, module_progress, modules, notification_deliveries, notifications, notion_states, notions, profiles, programme_proposals, review_logs, rows, schedule_slots | — |
| [x] | `formations.maintenance` | POST | `/api/v1/formations/:fid/maintenance` | py | `final-review.ts` | formations, group_members, groups, milestones, module_progress, modules, notification_deliveries, notifications, notion_states, notions, profiles, programme_proposals, review_logs, rows, schedule_slots | — |
| [x] | `formations.replan` | POST | `/api/v1/formations/:fid/replan` | py | `agenda-deplacer-et-reajuster-le-planning.ts` | chapters, formations, group_members, groups, modules, profiles, public, schedule_slots, study_preferences | `agenda-deplacer-et-reajuster-le-planning.test.ts` |
| [x] | `formations.replan-options` | POST | `/api/v1/formations/:fid/replan-options` | py | `agenda-deplacer-et-reajuster-le-planning.ts` | chapters, formations, group_members, groups, modules, profiles, public, schedule_slots, study_preferences | `agenda-deplacer-et-reajuster-le-planning.test.ts` |
| [x] | `gaps.list` | GET | `/api/v1/formations/:fid/gaps` | py | `gaps.ts` | chapters, course_sections, courses, formations, free, gap_events, group_members, groups, modules, notion_states, notions, profiles | — |
| [ ] | `review.answer` | POST | `/api/v1/review-sessions/:sid/answers` | ts | `review.ts` | activities, answers, attempts, automation_actions, automation_settings, brick_versions, bricks, chapters, daily_activity, formations, game, group_members, groups, its, module_progress, modules, notion_states, notions, one, profiles, public, review_logs, schedule_slots, started_at, two | — |
| [ ] | `review.complete` | POST | `/api/v1/review-sessions/:sid/complete` | ts | `review.ts` | activities, answers, attempts, automation_actions, automation_settings, brick_versions, bricks, chapters, daily_activity, formations, game, group_members, groups, its, module_progress, modules, notion_states, notions, one, profiles, public, review_logs, schedule_slots, started_at, two | `final-review.test.ts` |
| [ ] | `review.globalQuizToday` | GET | `/api/v1/formations/:fid/global-quiz/today` | ts | `review.ts` | activities, answers, attempts, automation_actions, automation_settings, brick_versions, bricks, chapters, daily_activity, formations, game, group_members, groups, its, module_progress, modules, notion_states, notions, one, profiles, public, review_logs, schedule_slots, started_at, two | — |
| [x] | `series.milestones` | GET | `/api/v1/milestones` | py | `serie-regularite-et-jalons-interface.ts` | daily_activity, formations, group_members, groups, milestones, module_progress, modules, notion_states, notions, pauses, persisted, profiles, public, study_preferences | `streak-milestones-route.test.ts`, `spec-723.spec.ts` |
| [x] | `series.streak` | GET | `/api/v1/streak` | py | `serie-regularite-et-jalons-interface.ts` | daily_activity, formations, group_members, groups, milestones, module_progress, modules, notion_states, notions, pauses, persisted, profiles, public, study_preferences | `streak-milestones-route.test.ts` |
| [x] | `slots.alternatives` | GET | `/api/v1/slots/:sid/alternatives` | py | `agenda-deplacer-et-reajuster-le-planning.ts` | chapters, formations, group_members, groups, modules, profiles, public, schedule_slots, study_preferences | `agenda-deplacer-et-reajuster-le-planning.test.ts` |
| [x] | `slots.move` | POST | `/api/v1/slots/:sid/move` | py | `agenda-deplacer-et-reajuster-le-planning.ts` | chapters, formations, group_members, groups, modules, profiles, public, schedule_slots, study_preferences | `agenda-deplacer-et-reajuster-le-planning.test.ts` |
| [ ] | `warmups.answers.create` | POST | `/api/v1/warmups/:activityId/answers` | ts | `warmup.ts` | activities, answers, attempts, automation_actions, brick_versions, bricks, modules, notion_states, notions, profiles, public, review_logs, schedule_slots | — |
| [x] | `warmups.today.get` | GET | `/api/v1/warmups/today` | py | `warmup.ts` | activities, answers, attempts, automation_actions, brick_versions, bricks, modules, notion_states, notions, profiles, public, review_logs, schedule_slots | — |

### assessments (26)

| Fait | Opération | Méthode | Chemin | Propriétaire | Implémentation TS | Tables | Tests TS |
|---|---|---|---|---|---|---|---|
| [ ] | `bricks.correct` | PATCH | `/api/v1/bricks/:bid` | ts | `bricks.ts` | brick_reports, brick_versions, bricks, draws, formations, notions, public, resource_chunks, resources | — |
| [ ] | `bricks.report` | POST | `/api/v1/bricks/:bid/report` | ts | `bricks.ts` | brick_reports, brick_versions, bricks, draws, formations, notions, public, resource_chunks, resources | — |
| [ ] | `exam.answers.save` | PUT | `/api/v1/mock-exams/:aid/answers/:pos` | ts | `mock-exams.ts` | activities, answers, attempts, brick_versions, bricks, chapters, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, resources, review_logs, schedule_slots | — |
| [ ] | `exam.attempts.create` | POST | `/api/v1/formations/:fid/mock-exams/attempts` | ts | `mock-exams.ts` | activities, answers, attempts, brick_versions, bricks, chapters, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, resources, review_logs, schedule_slots | — |
| [ ] | `exam.attempts.get` | GET | `/api/v1/mock-exams/:aid` | ts | `mock-exams.ts` | activities, answers, attempts, brick_versions, bricks, chapters, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, resources, review_logs, schedule_slots | — |
| [ ] | `exam.attempts.result` | GET | `/api/v1/mock-exams/:aid/result` | ts | `mock-exams.ts` | activities, answers, attempts, brick_versions, bricks, chapters, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, resources, review_logs, schedule_slots | — |
| [ ] | `exam.attempts.submit` | POST | `/api/v1/mock-exams/:aid/submit` | ts | `mock-exams.ts` | activities, answers, attempts, brick_versions, bricks, chapters, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, resources, review_logs, schedule_slots | — |
| [ ] | `exam.format.confirm` | POST | `/api/v1/formations/:fid/mock-exams/format` | ts | `mock-exams.ts` | activities, answers, attempts, brick_versions, bricks, chapters, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, resources, review_logs, schedule_slots | — |
| [ ] | `exam.intro` | GET | `/api/v1/formations/:fid/mock-exams` | ts | `mock-exams.ts` | activities, answers, attempts, brick_versions, bricks, chapters, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, resources, review_logs, schedule_slots | — |
| [ ] | `exam.questions.mark` | PUT | `/api/v1/mock-exams/:aid/marks/:pos` | ts | `mock-exams.ts` | activities, answers, attempts, brick_versions, bricks, chapters, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, resources, review_logs, schedule_slots | — |
| [ ] | `exercises.detail` | GET | `/api/v1/formations/:fid/modules/:mid/exercises/:aid` | ts | `exercises.ts` | activities, answers, attempts, brick_versions, bricks, formations, its, modules, notion_states, notions, profiles, public, resources, review_logs | — |
| [ ] | `exercises.hint` | POST | `/api/v1/modules/:mid/exercises/:aid/hint` | ts | `exercises.ts` | activities, answers, attempts, brick_versions, bricks, formations, its, modules, notion_states, notions, profiles, public, resources, review_logs | — |
| [ ] | `exercises.saveDraft` | PUT | `/api/v1/exercises/:aid/draft` | ts | `exercises.ts` | activities, answers, attempts, brick_versions, bricks, formations, its, modules, notion_states, notions, profiles, public, resources, review_logs | — |
| [ ] | `exercises.start` | POST | `/api/v1/modules/:mid/exercises/:aid/attempts` | ts | `exercises.ts` | activities, answers, attempts, brick_versions, bricks, formations, its, modules, notion_states, notions, profiles, public, resources, review_logs | — |
| [ ] | `exercises.submit` | POST | `/api/v1/exercises/:aid/submissions` | ts | `exercises.ts` | activities, answers, attempts, brick_versions, bricks, formations, its, modules, notion_states, notions, profiles, public, resources, review_logs | — |
| [ ] | `offline.pack` | GET | `/api/v1/offline/pack` | ts | `offline.ts` | activities, answers, attempts, automation_actions, automation_settings, brick_versions, bricks, chapters, daily_activity, formations, game, group_members, groups, modules, notion_states, notions, offline_sync_receipts, one, profiles, public, review_logs, schedule_slots, started_at, two | `offline.spec.ts` |
| [ ] | `offline.sync` | POST | `/api/v1/sync/offline-answers` | ts | `offline.ts` | activities, answers, attempts, automation_actions, automation_settings, brick_versions, bricks, chapters, daily_activity, formations, game, group_members, groups, modules, notion_states, notions, offline_sync_receipts, one, profiles, public, review_logs, schedule_slots, started_at, two | `sync-route.test.ts`, `review-automations.spec.ts`, `offline.spec.ts` |
| [ ] | `quiz.answers.check` | POST | `/api/v1/attempts/:aid/answers/:pos/check` | ts | `attempts.ts` | activities, answers, attempts, automation_actions, brick_versions, bricks, chapters, courses, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, review_logs | — |
| [ ] | `quiz.answers.save` | PUT | `/api/v1/attempts/:aid/answers/:pos` | ts | `attempts.ts` | activities, answers, attempts, automation_actions, brick_versions, bricks, chapters, courses, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, review_logs | — |
| [ ] | `quiz.attempts.create` | POST | `/api/v1/modules/:mid/quiz/attempts` | ts | `attempts.ts` | activities, answers, attempts, automation_actions, brick_versions, bricks, chapters, courses, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, review_logs | — |
| [ ] | `quiz.attempts.get` | GET | `/api/v1/attempts/:aid` | ts | `attempts.ts` | activities, answers, attempts, automation_actions, brick_versions, bricks, chapters, courses, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, review_logs | — |
| [ ] | `quiz.attempts.result` | GET | `/api/v1/attempts/:aid/result` | ts | `quiz-result.ts` | activities, answers, attempts, automation_actions, automation_settings, brick_versions, bricks, chapters, citations, course_sections, courses, formations, group_members, groups, its, modules, notion_states, notions, persisted, profiles, public, review_logs | — |
| [ ] | `quiz.attempts.submit` | POST | `/api/v1/attempts/:aid/submit` | ts | `attempts.ts` | activities, answers, attempts, automation_actions, brick_versions, bricks, chapters, courses, formations, group_members, groups, its, module_progress, modules, notion_states, notions, profiles, public, review_logs | — |
| [ ] | `remediation.complete` | POST | `/api/v1/modules/:mid/remediation/complete` | ts | `quiz-result.ts` | activities, answers, attempts, automation_actions, automation_settings, brick_versions, bricks, chapters, citations, course_sections, courses, formations, group_members, groups, its, modules, notion_states, notions, persisted, profiles, public, review_logs | — |
| [ ] | `remediation.get` | GET | `/api/v1/modules/:mid/remediation` | ts | `quiz-result.ts` | activities, answers, attempts, automation_actions, automation_settings, brick_versions, bricks, chapters, citations, course_sections, courses, formations, group_members, groups, its, modules, notion_states, notions, persisted, profiles, public, review_logs | — |
| [ ] | `remediation.prepare` | POST | `/api/v1/modules/:mid/remediation` | ts | `quiz-result.ts` | activities, answers, attempts, automation_actions, automation_settings, brick_versions, bricks, chapters, citations, course_sections, courses, formations, group_members, groups, its, modules, notion_states, notions, persisted, profiles, public, review_logs | — |

## Modules d’implémentation source

| Fichier TypeScript | Opérations |
|---|---|
| `packages/api-routes/src/implementations/agenda-deplacer-et-reajuster-le-planning.ts` | 4 |
| `packages/api-routes/src/implementations/agenda.ts` | 1 |
| `packages/api-routes/src/implementations/attempts.ts` | 5 |
| `packages/api-routes/src/implementations/bricks.ts` | 2 |
| `packages/api-routes/src/implementations/exercises.ts` | 5 |
| `packages/api-routes/src/implementations/final-review.ts` | 2 |
| `packages/api-routes/src/implementations/gaps.ts` | 1 |
| `packages/api-routes/src/implementations/mock-exams.ts` | 8 |
| `packages/api-routes/src/implementations/offline.ts` | 2 |
| `packages/api-routes/src/implementations/quiz-result.ts` | 4 |
| `packages/api-routes/src/implementations/review.ts` | 3 |
| `packages/api-routes/src/implementations/serie-regularite-et-jalons-interface.ts` | 2 |
| `packages/api-routes/src/implementations/warmup.ts` | 2 |

## Domaines purs à porter (étape 2)

| Paquet TypeScript | Rôle | Landing Python |
|---|---|---|
| `packages/learning-engine/src/{random,time,params,errors}.ts` | PRNG ensemencé, temps local, paramètres, erreurs | `learny/learning/domain/{prng,time,params,errors}.py` |
| `packages/learning-engine/src/fsrs/*` | FSRS 5.4.2 (scheduler, médiane, revue) | `learny/learning/domain/fsrs.py` |
| `packages/learning-engine/src/mastery/*` | Maîtrise pondérée par récence | `learny/learning/domain/mastery.py` |
| `packages/learning-engine/src/metrics/*` | Rétention (`calculateRetention`) et progression | `learny/learning/domain/metrics.py` |
| `packages/learning-engine/src/streak/*` | Série, régularité, jalons | `learny/learning/domain/streak.py` |
| `packages/learning-engine/src/gaps/*` | Détection et normalisation des lacunes | `learny/learning/domain/gaps.py` |
| `packages/learning-engine/src/draw/*` | Tirage déterministe des questions | `learny/learning/domain/draw.py` |
| `packages/learning-engine/src/session/*` | Choix de format | `learny/learning/domain/session.py` |
| `packages/learning-engine/src/warmup/*` | Sélection des échauffements | `learny/learning/domain/warmup.py` |
| `packages/learning-engine/src/global-quiz/*` | `buildDailySession`, lissage, entrelacement | `learny/learning/domain/global_quiz.py` |
| `packages/learning-engine/src/planner/*` | Grille, créneaux, `planSchedule`, `replan` | `learny/learning/domain/planner.py` |
| `packages/bricks/src/*` (hors vues React) | 13 types : schéma, correction, empreinte, payload public, mélange | `learny/assessments/domain/bricks/` |

## Consommateurs et crons du périmètre (cas d’usage à porter, branchement SPEC-2207)

| Job | Déclencheur | Cas d’usage Python |
|---|---|---|
| `quiz-grade` | `quiz/submitted` | `learny.learning.application.grading.grade_quiz` |
| `plan-programme` | `formation/programme-validated` | `learny.learning.application.planning.plan_programme` |
| `exam-deadline` | `exam/started` | `learny.assessments.application.exams.submit_exam_at_deadline` |
| `remediation-prepare` | `quiz/graded` | `learny.assessments.application.remediation.prepare_remediation` |
| `offline-receipts-purge` | `cron/nightly` | `learny.assessments.application.offline.purge_offline_receipts` |
| `module-unlock` | `quiz/graded` | déjà porté (`learny.formation`), branchement SPEC-2207 |

Modules TS : `packages/jobs/src/functions/quiz-grade.ts`, `packages/jobs/src/functions/exam-deadline.ts`, `packages/jobs/src/functions/programme.ts`, `packages/jobs/src/functions/offline-receipts-purge.ts`, `packages/jobs/src/functions/remediation-prepare.ts`, `packages/jobs/src/functions/module-unlock.ts`.

## Événements produits et consommés

| Événement | Producteurs | Consommateurs |
|---|---|---|
| `cron/nightly` | — | `packages/jobs/src/functions/account-deletion.ts`, `packages/jobs/src/functions/exports-purge.ts`, `packages/jobs/src/functions/nightly-outbox-cleanup.ts`, `packages/jobs/src/functions/offline-receipts-purge.ts`, `packages/jobs/src/functions/prepare-question-bank.ts` |
| `exam/started` | `packages/services/src/mock-exams/attempt.ts` | `packages/jobs/src/functions/exam-deadline.ts` |
| `exam/submitted` | `packages/services/src/mock-exams/attempt.ts` | — |
| `formation/completed` | `packages/services/src/quiz/module-unlock.ts` | — |
| `gap/cleared` | `packages/services/src/learning/apply-result.ts` | — |
| `gap/detected` | `packages/services/src/learning/apply-result.ts` | — |
| `gap/nature-changed` | `packages/services/src/learning/apply-result.ts` | — |
| `module/validated` | `packages/services/src/quiz/module-unlock.ts` | — |
| `quiz/graded` | `packages/services/src/quiz/submit.ts` | `packages/jobs/src/functions/module-unlock.ts`, `packages/jobs/src/functions/remediation-prepare.ts` |
| `quiz/submitted` | `packages/services/src/quiz/submit.ts` | `packages/jobs/src/functions/quiz-grade.ts` |
| `remediation/requested` | `packages/services/src/remediation/index.ts` | `packages/jobs/src/functions/remediation-prepare.ts` |
| `review/answered` | `packages/services/src/warmup/answer.ts` | — |
| `review/session-completed` | `packages/services/src/review/global-quiz.ts` | — |

## Tests TypeScript à porter (`evidence/SPEC-2001/test-port-map.md`)

**99 fichiers de test** ciblent SPEC-2202 dans la carte de portage.

| Fichier | Cas | Tag | Module pytest cible |
|---|---|---|---|
| `packages/bricks/src/architecture.test.ts` | 2 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_architecture.py` |
| `packages/bricks/src/checks-branches.test.ts` | 7 | SPEC-501 | `packages-py/learny/tests/unit/bricks/test_checks_branches.py` |
| `packages/bricks/src/fingerprint.test.ts` | 5 | SPEC-501 | `packages-py/learny/tests/unit/bricks/test_fingerprint.py` |
| `packages/bricks/src/grade.test.ts` | 11 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_grade.py` |
| `packages/bricks/src/normalize.test.ts` | 1 | SPEC-501 | `packages-py/learny/tests/unit/bricks/test_normalize.py` |
| `packages/bricks/src/public.test.ts` | 6 | SPEC-501 | `packages-py/learny/tests/unit/bricks/test_public.py` |
| `packages/bricks/src/registry-answers.test.ts` | 1 | SPEC-501 | `packages-py/learny/tests/unit/bricks/test_registry_answers.py` |
| `packages/bricks/src/registry.test.ts` | 5 | SPEC-501 | `packages-py/learny/tests/unit/bricks/test_registry.py` |
| `packages/bricks/src/types/categorization/grade.test.ts` | 10 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_grade.py` |
| `packages/bricks/src/types/categorization/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/choice-question/grade.test.ts` | 6 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_grade.py` |
| `packages/bricks/src/types/choice-question/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/choice-question/view.test.tsx` | 4 | SPEC-503 | `packages-py/learny/tests/unit/bricks/test_view.py` |
| `packages/bricks/src/types/cloze/grade.test.ts` | 4 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_grade.py` |
| `packages/bricks/src/types/cloze/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/instruction/response.test.ts` | 7 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_response.py` |
| `packages/bricks/src/types/instruction/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/instruction/table-checks.test.ts` | 7 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_table_checks.py` |
| `packages/bricks/src/types/instruction/view.test.tsx` | 4 | SPEC-503 | `packages-py/learny/tests/unit/bricks/test_view.py` |
| `packages/bricks/src/types/matching/grade.test.ts` | 10 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_grade.py` |
| `packages/bricks/src/types/matching/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/matching/view.test.tsx` | 3 | SPEC-503 | `packages-py/learny/tests/unit/bricks/test_view.py` |
| `packages/bricks/src/types/open-question/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/ordering/grade.test.ts` | 4 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_grade.py` |
| `packages/bricks/src/types/ordering/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/ordering/view.test.tsx` | 2 | SPEC-503 | `packages-py/learny/tests/unit/bricks/test_view.py` |
| `packages/bricks/src/types/recall-card/grade.test.ts` | 2 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_grade.py` |
| `packages/bricks/src/types/recall-card/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/recall-card/view.test.tsx` | 2 | SPEC-503 | `packages-py/learny/tests/unit/bricks/test_view.py` |
| `packages/bricks/src/types/resource-excerpt/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/scoring/compute.test.ts` | 11 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_compute.py` |
| `packages/bricks/src/types/scoring/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/scripted-dialogue/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/text/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/text/view.test.tsx` | 2 | SPEC-503 | `packages-py/learny/tests/unit/bricks/test_view.py` |
| `packages/bricks/src/types/timer/schema.test.ts` | 0 | — | `packages-py/learny/tests/unit/bricks/test_schema.py` |
| `packages/bricks/src/types/timer/state.test.ts` | 8 | SPEC-502 | `packages-py/learny/tests/unit/bricks/test_state.py` |
| `packages/bricks/src/types/timer/view.test.tsx` | 2 | SPEC-503 | `packages-py/learny/tests/unit/bricks/test_view.py` |
| `packages/bricks/src/validate-locations.test.ts` | 5 | SPEC-501 | `packages-py/learny/tests/unit/bricks/test_validate_locations.py` |
| `packages/bricks/src/validate.test.ts` | 35 | SPEC-501 | `packages-py/learny/tests/unit/bricks/test_validate.py` |
| `packages/bricks/src/view/labels.test.ts` | 3 | SPEC-503 | `packages-py/learny/tests/unit/bricks/test_labels.py` |
| `packages/bricks/src/view/markdown.test.tsx` | 4 | SPEC-503 | `packages-py/learny/tests/unit/bricks/test_markdown.py` |
| `packages/bricks/src/view/registry.test.tsx` | 1 | SPEC-503 | `packages-py/learny/tests/unit/bricks/test_registry.py` |
| `packages/learning-engine/src/draw/draw-attempt.test.ts` | 23 | SPEC-405 | `packages-py/learny/tests/unit/learning-engine/test_draw_attempt.py` |
| `packages/learning-engine/src/fixtures/builders.test.ts` | 3 | SPEC-401 | `packages-py/learny/tests/unit/learning-engine/test_builders.py` |
| `packages/learning-engine/src/fixtures/sap-reference.test.ts` | 7 | SPEC-401 | `packages-py/learny/tests/unit/learning-engine/test_sap_reference.py` |
| `packages/learning-engine/src/fsrs/review.test.ts` | 25 | SPEC-402 | `packages-py/learny/tests/unit/learning-engine/test_review.py` |
| `packages/learning-engine/src/gaps/detect.test.ts` | 39 | SPEC-404 | `packages-py/learny/tests/unit/learning-engine/test_detect.py` |
| `packages/learning-engine/src/global-quiz/build-daily-session.test.ts` | 20 | SPEC-406 | `packages-py/learny/tests/unit/learning-engine/test_build_daily_session.py` |
| `packages/learning-engine/src/mastery/calculate.test.ts` | 14 | SPEC-403 | `packages-py/learny/tests/unit/learning-engine/test_calculate.py` |
| `packages/learning-engine/src/metrics/retention.test.ts` | 30 | SPEC-408 | `packages-py/learny/tests/unit/learning-engine/test_retention.py` |
| `packages/learning-engine/src/params.test.ts` | 5 | SPEC-401 | `packages-py/learny/tests/unit/learning-engine/test_params.py` |
| `packages/learning-engine/src/planner/plan-validation.test.ts` | 10 | SPEC-407 | `packages-py/learny/tests/unit/learning-engine/test_plan_validation.py` |
| `packages/learning-engine/src/planner/plan.test.ts` | 20 | SPEC-407 | `packages-py/learny/tests/unit/learning-engine/test_plan.py` |
| `packages/learning-engine/src/random.test.ts` | 5 | SPEC-401 | `packages-py/learny/tests/unit/learning-engine/test_random.py` |
| `packages/learning-engine/src/session/format-choice.test.ts` | 9 | SPEC-716 | `packages-py/learny/tests/unit/learning-engine/test_format_choice.py` |
| `packages/learning-engine/src/streak/calculate.test.ts` | 31 | SPEC-409 | `packages-py/learny/tests/unit/learning-engine/test_calculate.py` |
| `packages/learning-engine/src/time.test.ts` | 9 | SPEC-401 | `packages-py/learny/tests/unit/learning-engine/test_time.py` |
| `packages/learning-engine/src/types.test.ts` | 9 | SPEC-401 | `packages-py/learny/tests/unit/learning-engine/test_types.py` |
| `packages/learning-engine/src/warmup/select.test.ts` | 16 | SPEC-410 | `packages-py/learny/tests/unit/learning-engine/test_select.py` |
| `packages/learning-engine/test/integration/draw-attempt.test.ts` | 4 | SPEC-405 | `packages-py/learny/tests/integration/learning-engine/test_draw_attempt.py` |
| `packages/learning-engine/test/integration/engine-boundaries.test.ts` | 3 | SPEC-401 | `packages-py/learny/tests/integration/learning-engine/test_engine_boundaries.py` |
| `packages/learning-engine/test/integration/fsrs.test.ts` | 5 | SPEC-402 | `packages-py/learny/tests/integration/learning-engine/test_fsrs.py` |
| `packages/learning-engine/test/integration/gaps.test.ts` | 7 | SPEC-404 | `packages-py/learny/tests/integration/learning-engine/test_gaps.py` |
| `packages/learning-engine/test/integration/mastery.test.ts` | 3 | SPEC-403 | `packages-py/learny/tests/integration/learning-engine/test_mastery.py` |
| `packages/learning-engine/test/integration/metrics.test.ts` | 3 | SPEC-408 | `packages-py/learny/tests/integration/learning-engine/test_metrics.py` |
| `packages/learning-engine/test/integration/planner.test.ts` | 6 | SPEC-407 | `packages-py/learny/tests/integration/learning-engine/test_planner.py` |
| `packages/learning-engine/test/integration/session.test.ts` | 3 | SPEC-406 | `packages-py/learny/tests/integration/learning-engine/test_session.py` |
| `packages/learning-engine/test/integration/streak.test.ts` | 4 | SPEC-409 | `packages-py/learny/tests/integration/learning-engine/test_streak.py` |
| `packages/learning-engine/test/integration/warmup.test.ts` | 5 | SPEC-410 | `packages-py/learny/tests/integration/learning-engine/test_warmup.py` |
| `packages/services/src/agenda-deplacer-et-reajuster-le-planning.test.ts` | 2 | SPEC-705 | `packages-py/learny/tests/unit/learning/test_agenda_deplacer_et_reajuster_le_planning.py` |
| `packages/services/src/agenda/get-agenda.test.ts` | 7 | SPEC-704 | `packages-py/learny/tests/unit/learning/test_get_agenda.py` |
| `packages/services/src/bricks/brick-service.test.ts` | 6 | SPEC-501 | `packages-py/learny/tests/unit/assessments/test_brick_service.py` |
| `packages/services/src/bricks/grade-service.test.ts` | 2 | SPEC-502 | `packages-py/learny/tests/unit/assessments/test_grade_service.py` |
| `packages/services/src/exercises/grade-exercise.test.ts` | 6 | SPEC-613 | `packages-py/learny/tests/unit/assessments/test_grade_exercise.py` |
| `packages/services/src/exercises/validate-production.test.ts` | 6 | SPEC-613 | `packages-py/learny/tests/unit/assessments/test_validate_production.py` |
| `packages/services/src/gaps/links.test.ts` | 4 | SPEC-615 | `packages-py/learny/tests/unit/learning/test_links.py` |
| `packages/services/src/gaps/list-gaps.test.ts` | 6 | SPEC-615 | `packages-py/learny/tests/unit/learning/test_list_gaps.py` |
| `packages/services/src/learning/apply-result.test.ts` | 6 | SPEC-411 | `packages-py/learny/tests/unit/learning/test_apply_result.py` |
| `packages/services/src/learning/apply-review.test.ts` | 5 | SPEC-701 | `packages-py/learny/tests/unit/learning/test_apply_review.py` |
| `packages/services/src/learning/get-due-notions.test.ts` | 3 | SPEC-411 | `packages-py/learny/tests/unit/learning/test_get_due_notions.py` |
| `packages/services/src/learning/persist-plan.test.ts` | 3 | SPEC-411 | `packages-py/learny/tests/unit/learning/test_persist_plan.py` |
| `packages/services/src/mock-exams/attempt.test.ts` | 29 | SPEC-614 | `packages-py/learny/tests/unit/assessments/test_attempt.py` |
| `packages/services/src/mock-exams/format.test.ts` | 17 | SPEC-614 | `packages-py/learny/tests/unit/assessments/test_format.py` |
| `packages/services/src/mock-exams/grade.test.ts` | 4 | SPEC-614 | `packages-py/learny/tests/unit/assessments/test_grade.py` |
| `packages/services/src/mock-exams/review.test.ts` | 3 | SPEC-614 | `packages-py/learny/tests/unit/assessments/test_review.py` |
| `packages/services/src/mock-exams/timer.test.ts` | 5 | SPEC-614 | `packages-py/learny/tests/unit/assessments/test_timer.py` |
| `packages/services/src/offline/sync.test.ts` | 3 | SPEC-801 | `packages-py/learny/tests/unit/assessments/test_sync.py` |
| `packages/services/src/review/global-quiz.test.ts` | 39 | SPEC-701 | `packages-py/learny/tests/unit/learning/test_global_quiz.py` |
| `packages/services/src/review/micro-composition.test.ts` | 10 | SPEC-703 | `packages-py/learny/tests/unit/learning/test_micro_composition.py` |
| `packages/services/src/review/per-notion.test.ts` | 5 | SPEC-702 | `packages-py/learny/tests/unit/learning/test_per_notion.py` |
| `packages/services/src/review/rationale.test.ts` | 10 | SPEC-701, SPEC-703 | `packages-py/learny/tests/unit/learning/test_rationale.py` |
| `packages/services/src/serie-regularite-et-jalons-interface.test.ts` | 5 | SPEC-723 | `packages-py/learny/tests/unit/learning/test_serie_regularite_et_jalons_interface.py` |
| `packages/services/src/warmup/derive.test.ts` | 9 | SPEC-714 | `packages-py/learny/tests/unit/learning/test_derive.py` |
| `packages/services/src/warmup/warmup.test.ts` | 5 | SPEC-714 | `packages-py/learny/tests/unit/learning/test_warmup.py` |
| `packages/services/test/integration/agenda.test.ts` | 9 | SPEC-704 | `packages-py/learny/tests/integration/learning/test_agenda.py` |
| `packages/services/test/integration/bricks.test.ts` | 7 | SPEC-501 | `packages-py/learny/tests/integration/assessments/test_bricks.py` |
| `packages/services/test/integration/final-review.test.ts` | 6 | SPEC-617 | `packages-py/learny/tests/integration/learning/test_final_review.py` |
| `packages/services/test/integration/quiz-result.test.ts` | 10 | SPEC-612 | `packages-py/learny/tests/integration/assessments/test_quiz_result.py` |

## Étape 3 — mise en œuvre du contexte `learning`

| Opération | Requêtes | Cas d'usage | Handler | Tests d'intégration serveur |
|---|---|---|---|---|
| `agenda.get` | `read_agenda_*` | `application/agenda.get_agenda` | `handlers/learning.py` | `test_learning_agenda_gaps.py` (helpers) + parité |
| `gaps.list` | `read_gaps_*` | `application/gaps.list_gaps` | idem | `test_learning_agenda_gaps.py` (helpers) |
| `series.streak` | `read_series_*` | `application/series.get_streak` | idem | `test_learning_series.py` |
| `series.milestones` | `read_series_*`, `insert_series_milestone` | `application/series.get_milestones` | idem | `test_learning_series.py` |
| `formations.finalReview` | `read_final_review_*` | `application/final_review.get_final_review` | idem | `test_learning_final_review.py` |
| `formations.maintenance` | `lock_maintenance`, `read_maintenance_formation`, `update_maintenance_mode`, `cancel_future_slots`, `skip_scheduled_reminders` | `application/final_review.set_maintenance` | idem | `test_learning_final_review.py` |
| `slots.alternatives` | `read_slot_of_user`, `read_planning_*` | `application/planning.get_slot_alternatives` | idem | `test_learning_slots_replan.py` |
| `slots.move` | `lock_agenda_move`, `mark_slot_moved`, `insert_moved_slot` | `application/planning.move_slot` | idem | `test_learning_slots_replan.py` |
| `formations.replan-options` | `read_planning_*` | `application/planning.get_replan_options` | idem | `test_learning_slots_replan.py` |
| `formations.replan` | `lock_agenda_replan`, `update_formation_end_date`, `update_hours_per_day`, `insert_automation_action_quiet` | `application/planning.apply_replan` | idem | `test_learning_slots_replan.py` |
| `warmups.today.get` | `read_warmup_*` | `application/warmups.get_today_warmups` | idem | `test_learning_warmups.py` |

Conventions respectées : SQL copié du TypeScript (mêmes colonnes, `order by`, `for update`,
verrous consultatifs et dérivation de clé), un cas d'usage par fonction de service, mêmes codes
`AppError` et textes de `locale_fr`, ports explicites, handlers sans logique. Les événements
`formation/maintenance-changed`, `agenda/slot-moved`, `plan/replanned` et
`automation/action-proposed` portent les identifiants de déduplication du TypeScript.

### Tests

| Fichier | Cas | Couverture |
|---|---|---|
| `tests/integration/learning/test_learning_series.py` | 5 | série et régularité, absence d'activité, jalon idempotent et libellé, 404 de formation étrangère, prochain jalon |
| `tests/integration/learning/test_learning_final_review.py` | 5 | agrégats du bilan, 409 incomplet, 404/400, cycle light/stopped/light, version périmée |
| `tests/integration/learning/test_learning_slots_replan.py` | 7 | alternatives, déplacement rejouable, refus durée/chevauchement, module bloqué, options, allègement, version de plan |
| `tests/integration/learning/test_learning_warmups.py` | 5 | carte du jour, statut, RLS, item illisible, dérivées pures |
| `tests/integration/learning-engine/test_learning_agenda_gaps.py` | 8 | cibles et totaux d'agenda, liens de lacunes, raffinements de période |

Total de la suite Python après la tranche : **1335 tests**, dont 22 ajoutés par les quatre fichiers
d'intégration ci-dessus. `api/inventory.json` reste à jour (`inventory.mjs --check`) : il ne liste
que les tests TypeScript sources.
