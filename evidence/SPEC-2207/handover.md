# SPEC-2207 — handover après la troisième tranche (`tutor.generate_course` porté)

Date : 2026-11-22. Branche : `spec/SPEC-2207-bascule-jobs-crons-demos`. HEAD de la tranche :
`348330af`. État : **22 consommateurs câblés et testés, deux crons basculés, deux tâches de
planificateur portées, pont inline retiré, plus aucun consommateur `ts`**. Aucune route `dev.*`
touchée.

## 1. Ce qui est fait

- `learny_worker/consumers.py` : 22 consommateurs (une ligne par entrée de la table du plan P22),
  chacun déléguant au cas d'usage de son contexte, avec `timeout_s`, `max_attempts`, `run_at` et
  `validate` issus du plan. Détail et état par consommateur : `evidence/SPEC-2207/scope.md` §2.
- `learny_worker/scheduler.py` : tâche horaire (expiration des actions, `user/local-tick` par pages
  de 500 avec les charges et identifiants du TypeScript, `cron/hourly-tick {tickAt}`) et tâche
  nocturne (`cron/nightly {runDate}`) ; plus aucune tâche inactive après la bascule.
- `api/ownership.yaml` : **`consumers` et `crons` entièrement à `py`** (ADR-2032 fermée) ;
  `api/events.schema.json` gagne l'événement interne `job/daily-digest` (50 événements),
  `api/inventory.json` et `evidence/SPEC-2001/inventory.md` régénérés.
- `apps/worker-py/src/learny_worker/inline.py` : pont Hono retiré (`send` supprimé) ;
  `JOBS_MODE=inline` exécute les consommateurs `py` in-process.
- `apps/web/playwright.config.ts` : Hono tourne avec `LEARNY_API_ROLE=api` (pas de `/api/inngest`).
- Contexte engagement : `local_ticks.py` (fan-out horaire) et `digest.send_daily_digest_at` (point
  d'entrée de `job/daily-digest`), exportés par `learny.engagement.public`.
- Contexte tutor : `domain/course.py` (941 lignes, pur), `domain/course_prompt.py` (189 lignes),
  `application/generate_course.py` (973 lignes), exportés par `learny.tutor.public`.
- Oracle : `tools/oracles/course-vectors.mts` → `api/oracles/vectors/course.json` (68 Ko),
  rejoué par `packages-py/learny/tests/unit/tutor/test_tutor_course_domain.py` (99 cas).
- Tests : 4 fichiers unitaires (`test_consumers_registry.py`, `test_scheduler_tasks.py`,
  `test_inline_ownership.py`, `test_tutor_course_domain.py`), 7 fichiers d'intégration
  (`test_worker_consumers_{purges,digest,export,ingestion,grading,course}.py`,
  `test_worker_scheduler_ticks.py`) et le harnais `tests/support/jobs.py`.
- ADR : ADR-2033 (extraction mécanique pour l'oracle) ; ADR-2032 passe au statut « écart fermé ».

## 2. Ce qui reste exactement

1. **Routes `dev`, `dev-migration`, `dev-sdd-migration`** (43 routes de démonstration) et routes
   spéciales `_dev` / `relay-stream` dans `apps/api-py/src/learny_api/special/dev_*.py`, avec la
   garde `ENABLE_SDD_PAGES && APP_ENV != production` et `service_tx` autorisé. La façade relaie
   encore ces entrées `ts` : c'est la dernière zone avant CA-1 complet.
2. **Spéciaux restants** de `api/ownership.yaml` (`auth.*`, `dev.*`, `_dev/*`,
   `formations/:fid/sprints`, `relay-stream`) : hors périmètre de cette tranche.
3. **E2E complet** `@SPEC-2207` avec vidéo, page de démonstration `@visual`, puis
   `node tools/sdd/validate.mjs SPEC-2207` et `node tools/sdd/complete.mjs SPEC-2207`. Aucun des
   deux outils n'a été lancé (CP-21 reste `pending`).
4. **`evidence/SPEC-2207/acceptance.md`** : à écrire avec les preuves de CA-1 à CA-3 quand les
   routes `dev.*` seront servies par Python (CA-1 dépend de leur bascule).

## 3. Points de vigilance pour la tranche suivante

- **`tutor.generate_course`** : la clé de génération est l'identifiant d'événement
  (`course-generation:<module>:force:<version>`), donc un rejeu du même événement rend la version
  existante sans appel au modèle ; une nouvelle clé crée N+1 et laisse N non courante. Un échec non
  rejouable (`AI_UNAVAILABLE`, `AI_RATE_LIMITED`, `SERVICE_UNAVAILABLE` exceptés) écrit une version
  `failed` de la clé, jamais courante, et notifie `ai_task_failed` une seule fois.
- **Notifications** : appel direct à `engagement.notify` après le commit (BR-NOT-03), pas d'événement
  `notification/requested` : la charge, les clés de déduplication et les textes sont ceux du
  TypeScript, mais le canal est celui de `unlock_module`/`grade_quiz`. Un échec de notification est
  journalisé (`course-generation.notify.failed`) et ne fait pas échouer la livraison.
- **Budgets** : le chapitre entier est généré en un seul appel structuré, corrigé deux fois au plus
  (`course-invalid` épuise les corrections et rend `AI_TASK_FAILED`). Le budget de contexte de la
  tâche `course` (24 000 jetons) coupe au premier passage qui ne tient plus ; les identifiants
  retenus sont les seuls citable.
- **Purge de l'outbox** : lit `coalesce(sent_at, dispatched_at)` ; couvert par
  `test_a_nightly_tick_purges_the_delivered_outbox_once` (rejeu : aucun second effet).
- **`job/daily-digest`** : la charge ne porte que `{userId, at}` ; la zone vient du profil dans
  `send_daily_digest_at`. `run_at` est prouvé de bout en bout (colonne `run_after` d'une livraison en
  attente).
- **Planificateur** : les identifiants d'événement sont la garde d'idempotence entre deux instances
  (`test_two_schedulers_emit_a_single_tick_for_a_period`) ; le verrou consultatif reste celui de
  SPEC-2102.
- **`grade_quiz`** délègue à `grade_open_answers` → `finalize_attempt` → `apply_learning_result` ;
  un rejeu ne corrige rien et n'émet pas un second `quiz/graded`.
- **`unlock_module`** écrit le jalon en transaction de service ; la notification et la
  replanification sont après le commit.
- **`prepare_question_bank`** / `process_question_bank_jobs` : lot nocturne borné à 50, aucune
  variante inventée quand le fournisseur échoue. `prepare_question_bank` crée une tâche par notion
  du module et par format (8 pour un module de deux notions) ; c'est la livraison de
  `course/generated`, prouvée de bout en bout.
- **Prompt de correction ouverte** en anglais (ADR-2011) alors que le TypeScript l'écrit en
  français ; à aligner si la parité des prompts devient contractuelle en SPEC-2302.
- **`packages/tutor/src/course/generate.ts`** : quinze déclarations exportées et deux fonctions
  extraites à l'identique pour l'oracle (ADR-2033). Ce code est encore vivant jusqu'à SPEC-2302 :
  toute modification doit repasser `vitest --project unit packages/tutor` et l'oracle.
