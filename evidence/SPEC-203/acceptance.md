# SPEC-203 — critères d'acceptation

Mesures du 2026-11-12 sur la pile Supabase locale (`pnpm dev:up`), horloge figée ADR-0047 et IA
`LLM_MODE=mock`. Aucun appel à Inngest Cloud ni à un Inngest Dev Server : l'envoi est simulé par un
client injecté (intégration) ou exécuté dans le processus (`JOBS_MODE=inline`, e2e). Preuves :
`unit.json` (tests `[SPEC-203]`), `integration.json` (tests `[SPEC-203]`), `e2e.json` et les vidéos de
`video/`. Les maquettes n'ont pas été modifiées.

- ✅ **CA-1** — Un événement ajouté dans une transaction annulée n'est jamais envoyé ; dans une
  transaction validée il est envoyé exactement une fois, même si `dispatch` est appelé deux fois.
  Preuve : intégration `[SPEC-203] boîte d'envoi` « CA-1, CL-1 — un événement ajouté dans une
  transaction annulée n'est jamais écrit ni envoyé » (`withTransaction` rejette, aucune ligne
  `event_outbox`, client simulé non appelé), « CA-1 — validé : envoyé exactement une fois, même si
  dispatch est rappelé » (un envoi, `sent_at` posé à l'instant de l'horloge figée, deux
  `dispatchPending` supplémentaires sans nouvel envoi), « CA-1 — deux dispatch concurrents… » et
  « CL-3 — le même identifiant émis deux fois ne crée qu'une ligne et qu'un envoi » (`enqueue_event`
  `on conflict do nothing`) ; transaction de l'utilisateur : « écrit dans la boîte avec le client de
  l'utilisateur », « refuse l'événement d'un autre utilisateur ou un événement cron/* » (42501,
  transaction annulée) et « le rôle utilisateur ne lit ni n'écrit directement la boîte d'envoi » ;
  « EF-2, CL-10 — un schéma violé est refusé à l'émission » (`AppError('INTERNAL_ERROR')`, journal
  `event_schema_violation` sans la donnée, rien d'écrit) ; « ET-2 — l'identifiant par défaut est stable »
  (`<nom>:<32 hex>`, indépendant de l'ordre des clés).
- ✅ **CA-2** — Inngest injoignable : l'événement reste en attente puis part au tick suivant ; après 10
  échecs il est `failed` et signalé.
  Preuve : intégration « CA-2, CL-2 — Inngest injoignable : la ligne reste en attente puis part au tick
  suivant » (`attempts = 1`, `last_error` renseigné, puis `dispatchPending` l'envoie), « CA-2 — après 10
  échecs, l'entrée est marquée en échec, journalisée et signalée » (`attempts = 10`, `failed = true`,
  journal `event_outbox_failed`, un rapport au reporter, plus aucun envoi ensuite) et « ET-2 — la
  dernière erreur ne contient ni la charge utile ni une trace de pile » (une ligne, ≤ 300 caractères).
- ✅ **CA-3** — Le pipeline de démonstration avec échec simulé termine ses 3 étapes avec `attempts = 2`
  et l'étape 1 exécutée une seule fois.
  Preuve : intégration `[SPEC-203] pipeline` « CA-3 — échec simulé de l'étape 2 : trois étapes
  terminées, attempts = 2, étape 1 exécutée une fois » (`executions = 2`, corps des étapes
  `{ step-1-prepare: 1, step-2-process: 2, step-3-finish: 1 }`, `sdd_demo_runs.attempts = 2`, trois
  entrées `steps`, `finished_at` posé) ; « ET-4 — chaque étape est idempotente » et « ET-4 — un échec
  définitif est rapporté et ne lève pas dans l'émetteur ». E2E `pipeline avec reprise et tick horaire
  @SPEC-203` : interrupteur « Faire échouer l'étape 2 une fois », trois étapes « Terminée »,
  « Exécutions : 2 » ; vidéo et capture `spec-203-jobs`.
- ✅ **CA-4** — Le tick de `2026-11-11T07:05:00Z` produit Paris 08:00–09:00 (mercredi, jour 3), Kolkata
  12:30–13:30, New York 02:00–03:00 ; les utilisateurs en onboarding sont exclus.
  Preuve : intégration `[SPEC-203] tick horaire` « CA-4 — fenêtres locales de 2026-11-11T07:05:00Z… »
  (6 utilisateurs de fabrique : Paris, Kolkata, New York, Auckland, onboarding `ia`, suppression échue ;
  4 `user/local-tick` seulement, fenêtre UTC `[07:00, 08:00[`, `localDate` 2026-11-11, `localWeekday` 3,
  `dueInWindow` cohérent dans chaque fuseau), « EF-3, CL-7 — identifiants déterministes par
  utilisateur et fenêtre » (`local-tick:<userId>:<windowStart>`, aucun doublon dans un même tick,
  événement global `hourly-tick:2026-11-11T07:05:00.000Z`) et « ET-5 — le tick à 07:05:30 est tronqué à
  la minute ». E2E `@SPEC-203` : lignes Paris `08:00–09:00` `mercredi (3)`, Kolkata `12:30–13:30`,
  New York `02:00–03:00`, 3 utilisateurs sélectionnés (l'utilisateur en onboarding est absent).
  Mesure CL-9 (`test-results/spec-203-tick-timing.json`, écrit par l'intégration « CL-9 — 2 000
  utilisateurs… ») : 2 004 utilisateurs sélectionnés en 5 pages de 500 maximum, tick exécuté en
  71 ms dans le processus (envoi capturé, sans réseau) pour un seuil de 60 s ; extrapolation linéaire à
  10 000 utilisateurs : 352 ms. La création des 2 000 utilisateurs de fabrique (triggers d'inscription)
  a pris 87,6 s et n'entre pas dans la mesure.
- ✅ **CA-5** — `dueInWindow` respecte les cas CL-4, CL-5 et CL-6 (tests tabulés).
  Preuve : unitaires `[SPEC-203] fenêtres locales` (8 tests : Kolkata `07:30` → 02:00 UTC et `08:00` →
  02:30 UTC ; Paris 29 mars 2026 `02:30` → 01:00 UTC, absent de la fenêtre précédente ; Paris 25
  octobre 2026 `02:30` → 00:30 UTC puis `null` à 01:05 et 02:05 UTC ; tick 22:05 UTC → 23:00–00:00
  avec `23:30` et `00:00` exclu ; `Pacific/Kiritimati` UTC+14) et `[SPEC-203] fuseaux` de
  `packages/core/src/zoned-time.test.ts` (18 tests : `zonedParts`, `localTimeToInstant` heure
  ordinaire, inexistante, ambiguë, New York, entrées invalides).
- ✅ **CA-6** — En `JOBS_MODE=inline`, l'émission exécute la fonction abonnée dans le processus et ses
  effets sont visibles avant la réponse HTTP suivante.
  Preuve : intégration `[SPEC-203] mode en ligne` « CA-6 — l'émission exécute la fonction abonnée dans
  le processus, effets visibles au retour » (`emitAfterCommit` avec `JOBS_MODE=inline` : au retour,
  `sdd_demo_runs` a `attempts = 2`, trois étapes et `finished_at`, la ligne de la boîte est envoyée),
  « CL-3 — un même identifiant ne déclenche qu'une exécution des consommateurs », « ET-3 — la
  profondeur est limitée » (5 niveaux, `inline_depth_exceeded`) et « ET-6 — le nettoyage nocturne
  supprime les lignes envoyées depuis plus de 7 jours » ; configuration : `[SPEC-203] JOBS_MODE` de
  `packages/config/src/env.test.ts` (refus de `inline` en production). E2E `@SPEC-203` : le pipeline de
  la page se termine (reprise comprise) sans Inngest Dev Server.
- ✅ **CA-7** — Toutes les fonctions enregistrées ont un identifiant unique et un déclencheur présent
  dans le catalogue.
  Preuve : unitaires `[SPEC-203] registre` (identifiants uniques et kebab-case ; chaque déclencheur est
  un événement de `EVENTS` ou un cron valide ; `cron-hourly-tick` `TZ=UTC 5 * * * *`, `cron-nightly`
  `TZ=UTC 30 1 * * *`, `sdd-demo-pipeline` 3 reprises ; concurrence par utilisateur par défaut) et
  `[SPEC-203] catalogue des événements` (36 événements, un exemple valide chacun, UUID refusés,
  instants sans fuseau refusés, bornes et énumérations).

Non-régression rejouée : intégration `[SPEC-007]` (registre partagé à 5 fonctions, routes
`/api/inngest` de `apps/web` et `apps/worker` : le worker démarre avec le registre complet), matrice RLS
`[SPEC-113]` à 53 tables dont 4 de service (`event_outbox`, `sdd_demo_runs` : RLS forcée, accès client
refusé), contrats OpenAPI `[SPEC-201]` (7 opérations documentées).
