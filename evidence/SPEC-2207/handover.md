# SPEC-2207 — handover après la deuxième tranche (worker câblé, crons basculés)

Date : 2026-11-22. Branche : `spec/SPEC-2207-bascule-jobs-crons-demos`. HEAD de la tranche :
`f54b0a45` (puis commits de documentation). État : **21 consommateurs câblés et testés, deux crons
basculés, deux tâches de planificateur portées, pont inline retiré**. Aucune route `dev.*` touchée.

## 1. Ce qui est fait

- `learny_worker/consumers.py` : 21 consommateurs (une ligne par entrée de la table du plan P22 dont
  le cas d'usage Python existe), chacun déléguant au cas d'usage de son contexte, avec `timeout_s`,
  `max_attempts`, `run_at` et `validate` issus du plan. Détail et état par consommateur :
  `evidence/SPEC-2207/scope.md` §2.
- `learny_worker/scheduler.py` : tâche horaire (expiration des actions, `user/local-tick` par pages
  de 500 avec les charges et identifiants du TypeScript, `cron/hourly-tick {tickAt}`) et tâche
  nocturne (`cron/nightly {runDate}`) ; plus aucune tâche inactive après la bascule.
- `api/ownership.yaml` : `consumers` et `crons` à `py` (seul `tutor.generate_course` reste `ts`,
  ADR-2032) ; `api/events.schema.json` gagne l'événement interne `job/daily-digest` (50 événements),
  `api/inventory.json` et `evidence/SPEC-2001/inventory.md` régénérés.
- `apps/worker-py/src/learny_worker/inline.py` : pont Hono retiré (`send` supprimé) ;
  `JOBS_MODE=inline` exécute les consommateurs `py` in-process.
- `apps/web/playwright.config.ts` : Hono tourne avec `LEARNY_API_ROLE=api` (pas de `/api/inngest`).
- Contexte engagement : `local_ticks.py` (fan-out horaire) et `digest.send_daily_digest_at` (point
  d'entrée de `job/daily-digest`), exportés par `learny.engagement.public`.
- Tests : 3 fichiers unitaires (`test_consumers_registry.py`, `test_scheduler_tasks.py`,
  `test_inline_ownership.py`), 6 fichiers d'intégration (`test_worker_consumers_purges.py`,
  `test_worker_consumers_digest.py`, `test_worker_consumers_export.py`,
  `test_worker_consumers_ingestion.py`, `test_worker_consumers_grading.py`,
  `test_worker_scheduler_ticks.py`) et le harnais `tests/support/jobs.py`.

## 2. Ce qui reste exactement

1. **Porter `tutor.generate_course`** (SPEC-2204) puis basculer la dernière ligne
   `tutor.generate_course` à `py` et la déclarer dans le registre ; le test
   `test_the_only_typescript_consumer_is_the_unported_course_generation` échouera volontairement et
   devra être mis à jour avec ADR-2032.
2. **Routes `dev`, `dev-migration`, `dev-sdd-migration`** (43 routes de démonstration) et routes
   spéciales `_dev` / `relay-stream` dans `apps/api-py/src/learny_api/special/dev_*.py`, avec la
   garde `ENABLE_SDD_PAGES && APP_ENV != production` et `service_tx` autorisé. La façade relaie
   encore ces entrées `ts` : c'est la dernière zone avant CA-1 complet.
3. **Spéciaux restants** de `api/ownership.yaml` (`auth.*`, `dev.*`, `_dev/*`,
   `formations/:fid/sprints`, `relay-stream`) : hors périmètre de cette tranche.
4. **E2E complet** `@SPEC-2207` avec vidéo, page de démonstration `@visual`, puis
   `node tools/sdd/validate.mjs SPEC-2207` et `node tools/sdd/complete.mjs SPEC-2207`. Aucun des
   deux outils n'a été lancé dans cette tranche (CP-21 reste `pending`).
5. **`evidence/SPEC-2207/acceptance.md`** : à écrire avec les preuves de CA-1 à CA-3 quand les
   routes `dev.*` seront servies par Python (CA-1 dépend de leur bascule).

## 3. Points de vigilance pour la tranche suivante

- **Purge de l'outbox** : lit `coalesce(sent_at, dispatched_at)` ; couvert par
  `test_a_nightly_tick_purges_the_delivered_outbox_once` (rejeu : aucun second effet).
- **`job/daily-digest`** : la charge ne porte que `{userId, at}` ; la zone vient du profil dans
  `send_daily_digest_at` (un profil disparu entre le plan et l'envoi ne notifie rien, sans échec).
  `run_at` est prouvé de bout en bout (colonne `run_after` d'une livraison en attente).
- **Planificateur** : les identifiants d'événement sont la garde d'idempotence entre deux instances
  (`test_two_schedulers_emit_a_single_tick_for_a_period`) ; le verrou consultatif reste celui de
  SPEC-2102 (`test_two_schedulers_elect_a_single_leader`, `test_only_the_leader_runs_the_new_tasks`).
- **`grade_quiz`** délègue à `grade_open_answers` → `finalize_attempt` → `apply_learning_result` ;
  un rejeu ne corrige rien et n'émet pas un second `quiz/graded` (test d'intégration dédié).
- **`unlock_module`** écrit le jalon en transaction de service ; la notification et la
  replanification sont après le commit et ne peuvent pas annuler le déblocage.
- **`prepare_question_bank`** / `process_question_bank_jobs` : lot nocturne borné à 50, aucune
  variante inventée quand le fournisseur échoue.
- **Prompt de correction ouverte** en anglais (ADR-2011) alors que le TypeScript l'écrit en
  français ; la fixture de simulation est sélectionnée par scénario explicite. À aligner si la
  parité des prompts devient contractuelle en SPEC-2302.
- **`tutor.generate_course`** : Inngest n'étant plus démarré (pile de tests et production), ce
  consommateur n'est exécuté par personne aujourd'hui ; l'écart est antérieur à cette tranche et
  documenté par ADR-2032.
