# SPEC-2207 — handover : ce qui reste après la première tranche

Date : 2026-11-22. Branche : `spec/SPEC-2207-bascule-jobs-crons-demos`.
État : **9 cas d'usage de job portés et testés** (voir `scope.md`), aucun câblage, aucune bascule.

## 1. Ce qui est fait

- Les neuf cas d'usage de la table du plan P22 : `purge_outbox`, `purge_security_rows`,
  `purge_offline_receipts`, `process_question_bank_jobs`, `prepare_question_bank`, `plan_programme`,
  `grade_quiz`, `submit_exam_at_deadline`, `unlock_module`, exposés par le `public.py` de leur
  contexte, avec leurs tests unitaires et d'intégration.
- Événements émis identiques (noms, identifiants de déduplication, charges) :
  `quiz/graded` (`quiz-graded:<attemptId>`), `module/validated` (`module-validated:<moduleId>`),
  `formation/completed` (`formation-completed:<formationId>`), `exam/submitted` (déjà porté).
- Codes `AppError` et textes `locale_fr` identiques au TypeScript ; horloge injectée partout ;
  aucun `time.time()`, `datetime.now()` ni `random`.
- `progress/state.json` : `SPEC-2207` est `in_progress` (branche, horodatage, validations vides).
  Les checkpoints n'ont pas été touchés.

## 2. Ce qui reste à faire (ordre conseillé)

1. **Porter `generate_course`.** Le consommateur `generate-course` (`chapter/contributions-completed`)
   n'a **aucun** cas d'usage Python : la table du plan l'attribue à SPEC-2204, mais seule la demande
   HTTP (`content.generate_course_now`) existe. Sans lui, la bascule des consommateurs est
   incomplète (les banques de questions ne se déclenchent jamais sur `course/generated`).
2. **Câbler le registre `apps/worker-py/src/learny_worker/consumers.py`** : une entrée par
   consommateur de la table du plan, avec `validate`, `run_at` (`submit_exam_at_deadline.run_at`) et
   les délais (`timeout_s` : 900 s banque de questions et export, 600 s ingestion et génération de
   cours, 300 s notation de quiz).
3. **Porter les tâches du planificateur** dans `learny_worker/scheduler.py` : `expire_due_automation_actions`,
   `user/local-tick` par pages de 500 (conservé pour la parité), émission de `cron/hourly-tick` et
   `cron/nightly`, puis les 6 tâches cron de `scope.md` §3 (dont les 3 tâches horaires de
   notification).
4. **Ajouter l'événement interne `job/daily-digest`** à `api/events.schema.json` (ADR-2014), avec la
   tâche `engagement.plan_daily_digests` qui l'émet (`run_at = data.at`, remplace `step.sleepUntil`).
5. **Basculer `consumers` et `crons` à `py`** dans `api/ownership.yaml` (en une fois), retirer le
   pont inline (P21) et la route de dispatch éventuelle, et configurer Hono sans `/api/inngest`
   (`LEARNY_API_ROLE=api`) dans `apps/web/playwright.config.ts`.
6. **Porter les routes `dev`, `dev-migration`, `dev-sdd-migration`** (43 routes de démonstration) et
   les routes spéciales `_dev` / `relay-stream` dans `apps/api-py/src/learny_api/special/dev_*.py`,
   avec la garde `ENABLE_SDD_PAGES && APP_ENV != production` et `service_tx` autorisé.
7. **Tests du worker** (SPEC-2207 ET-2) : un test d'intégration par consommateur câblé (succès,
   reprise, échec définitif, livraison dupliquée avec `job_deliveries`), et un test du planificateur
   à deux instances (un seul tick par échéance).
8. **E2E complet** `@SPEC-2207` avec vidéo, page de démonstration `@visual`, `validate.mjs SPEC-2207`
   puis `complete.mjs SPEC-2207`. Aucun de ces deux outils n'a été lancé dans cette tranche.

## 3. Points de vigilance pour la tranche suivante

- **Ancien écart assumé** : la purge de l'outbox lit `coalesce(sent_at, dispatched_at)` (le worker
  Python n'écrit que `dispatched_at`). Un test d'intégration le couvre.
- **`grade_quiz`** délègue à `grade_open_answers` → `finalize_attempt` → `apply_learning_result` :
  un rejeu du même `quiz/submitted` ne corrige rien et ne réémet pas `quiz/graded`
  (`quiz-graded:<attemptId>` est unique dans l'outbox). Le test d'intégration le vérifie.
- **`unlock_module`** écrit le jalon en transaction de service ; `engagement.notify` et la
  replanification sont après le commit et ne peuvent pas annuler le déblocage.
- **`prepare_question_bank`** écrit 4 tâches par notion (une par format) : la clé
  `(learner, notion, format, course version)` rend le rejeu sans effet. Le lot nocturne est borné à
  50 lignes et n'invente jamais de variante quand le fournisseur échoue (tâche `failed`,
  `error_code` du fournisseur).
- **Prompt de correction ouverte** : en anglais (ADR-2011) alors que le TypeScript l'écrit en
  français ; la fixture de simulation est sélectionnée par scénario explicite, donc aucun test ne
  dépend du texte du prompt. À aligner si la parité des prompts devient contractuelle en SPEC-2302.
- **`api/ownership.yaml`** n'a pas été modifié : `consumers` et `crons` restent `ts`.
